import type { SpawnSyncOptions } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import crossSpawn from 'cross-spawn'
import { expect } from 'vitest'
import { parse } from 'yaml'

interface Manifest {
  name: string
  version: string
}

/** 使用真实 pnpm 和本地 registry 验证配置写入，不依赖公网新包。 */
export async function consumerRegistry(manifests: Manifest[], tarballs: Uint8Array[], legacy = false) {
  const integrities = tarballs.map(bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`)
  const server = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const http = require('node:http');
    const server = http.createServer((req, res) => {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1));
      if (name.startsWith('tarballs/')) {
        const bytes = workerData.tarballs[Number(name.slice('tarballs/'.length))];
        if (!bytes) { res.writeHead(404); res.end(); return; }
        res.end(Buffer.from(bytes)); return;
      }
      const index = workerData.manifests.findIndex(pkg => name === pkg.name || name === pkg.name + '/' + pkg.version);
      if (index < 0) { res.writeHead(404); res.end('{}'); return; }
      const manifest = workerData.manifests[index];
      const metadata = { ...manifest, dist: { integrity: workerData.integrities[index], tarball: 'http://127.0.0.1:' + server.address().port + '/tarballs/' + index } };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(name === manifest.name ? { name: manifest.name, 'dist-tags': { latest: manifest.version, 'snapshot-nightly': manifest.version }, versions: { [manifest.version]: metadata }, time: { [manifest.version]: new Date().toISOString() } } : metadata));
    });
    server.listen(0, '127.0.0.1', () => parentPort.postMessage(server.address().port));
  `, { eval: true, workerData: { manifests, tarballs, integrities } })
  try {
    const port = await new Promise<number>((resolve, reject) => {
      server.once('message', resolve)
      server.once('error', reject)
    })
    const registry = `http://127.0.0.1:${port}/`
    const policies: Record<string, unknown>[] = []
    const fetcher: typeof globalThis.fetch = async (input, init) => {
      const url = new URL(String(input))
      expect(url.origin).toBe('https://registry.npmjs.org')
      const response = await fetch(new URL(url.pathname.slice(1), registry), init)
      if (url.pathname.startsWith('/tarballs/')) {
        return response
      }
      const metadata = await response.json() as { dist: { tarball: string } }
      metadata.dist.tarball = metadata.dist.tarball.replace(registry, 'https://registry.npmjs.org/')
      return Response.json(metadata)
    }
    const spawn = (command: string, args: readonly string[], settings: SpawnSyncOptions) => {
      const parameters = args!.map(value => value === '--registry=https://registry.npmjs.org/' ? `--registry=${registry}` : value)
      const policy = path.join(String(settings!.cwd), 'pnpm-workspace.yaml')
      if (parameters.includes('install') && legacy) {
        writeFileSync(policy, `${JSON.stringify(parse(readFileSync(policy, 'utf8')), null, 2)}\n`)
      }
      const result = crossSpawn.sync(command, parameters, settings)
      if (parameters.includes('install')) {
        policies.push(parse(readFileSync(policy, 'utf8')) as Record<string, unknown>)
      }
      return result
    }
    return { integrities, policies, spawn, fetcher, close: () => server.terminate() }
  }
  catch (error) {
    await server.terminate()
    throw error
  }
}

export const freshPeer = { name: 'fresh-consumer-peer', version: '1.0.0', type: 'module', exports: './index.js' }

export function withFreshPeer<T>(manifest: T) {
  const existing = manifest as { peerDependencies?: Record<string, string>, peerDependenciesMeta?: Record<string, unknown> }
  return {
    ...manifest,
    peerDependencies: { ...existing.peerDependencies, [freshPeer.name]: freshPeer.version },
    peerDependenciesMeta: { ...existing.peerDependenciesMeta, [freshPeer.name]: { optional: true } },
  }
}
