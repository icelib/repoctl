import type { PreparedSnapshotConsumerOptions, PreparedSnapshotPublishReport } from '@icebreakers/monorepo'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { Worker } from 'node:worker_threads'
import { verifyPreparedSnapshotConsumer } from '@icebreakers/monorepo'
import crossSpawn from 'cross-spawn'
import { expect, it } from 'vitest'
import { writeSnapshotArchive } from '../../../../../src/commands/release/snapshot/archive'
import { bundle } from './fixture'

it('consumes a real two-package registry batch through the built public API with exact aliases and disabled lifecycle scripts', async () => {
  const fixture = bundle()
  const directory = await mkdtemp(path.join(tmpdir(), 'repoctl-snapshot-registry-consumer-'))
  const manifests = fixture.manifests.map(manifest => ({ ...manifest, type: 'module', exports: './index.js', scripts: { postinstall: 'node -e "throw new Error(\'Candidate install scripts must not run\')"' } }))
  const bodies = [
    'export const value = 42;',
    'import { value } from "alias"; if (value !== 42) throw new Error("Snapshot dependency closure failed"); if (process.env.GITHUB_TOKEN || process.env.NPM_TOKEN || process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || process.env.NODE_OPTIONS) throw new Error("Consumer received credentials"); export { value };',
  ]
  const tarballs = manifests.map((manifest, index) => {
    const bytes = writeSnapshotArchive([
      { path: 'package/package.json', mode: 0o644, type: 'File', data: Buffer.from(JSON.stringify(manifest)) },
      { path: 'package/index.js', mode: 0o644, type: 'File', data: Buffer.from(bodies[index]!) },
    ])
    fixture.manifest.packages[index]!.integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    return bytes
  })
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
      res.end(JSON.stringify(name === manifest.name ? { name: manifest.name, 'dist-tags': { latest: manifest.version }, versions: { [manifest.version]: metadata }, time: { [manifest.version]: '2026-01-01T00:00:00.000Z' } } : metadata));
    });
    server.listen(0, '127.0.0.1', () => parentPort.postMessage(server.address().port));
  `, { eval: true, workerData: { manifests, tarballs, integrities: fixture.manifest.packages.map(pkg => pkg.integrity) } })
  try {
    const port = await new Promise<number>((resolve, reject) => {
      server.once('message', resolve)
      server.once('error', reject)
    })
    const registry = `http://127.0.0.1:${port}/`
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
    const spawn: NonNullable<PreparedSnapshotConsumerOptions['spawn']> = ((command, args, settings) => {
      const parameters = (args as string[]).map(value => value === '--registry=https://registry.npmjs.org/' ? `--registry=${registry}` : value)
      return crossSpawn.sync(command, parameters, settings as Parameters<typeof crossSpawn.sync>[2])
    }) as NonNullable<PreparedSnapshotConsumerOptions['spawn']>
    const report: PreparedSnapshotPublishReport = {
      schemaVersion: 1,
      status: 'published',
      manifest: fixture.manifest,
      evidence: { source: fixture.plan.source, freezeJobId: 1, buildJobId: 2, planArtifact: { id: 3, digest: 'sha256:x' }, buildArtifact: { id: 4, digest: 'sha256:y' }, planDigest: fixture.manifest.planDigest },
      packages: fixture.manifest.packages.map(pkg => ({ name: pkg.name, version: pkg.version, integrity: pkg.integrity, published: true })),
      install: { executable: 'pnpm', args: [] },
      installCommand: '',
      outputDirectory: directory,
    }
    const result = await verifyPreparedSnapshotConsumer({ report, outputDirectory: directory, registryFetch: fetcher, spawn, env: { ...process.env, GITHUB_TOKEN: 'github-secret', NPM_TOKEN: 'npm-secret', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-secret', NODE_OPTIONS: '--require=invalid-candidate-hook' } })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe('verified')
    expect(result.packages).toEqual(fixture.manifest.packages.map(({ name, version }) => ({ name, version })))
    expect(result.commands.filter(command => command.args.includes('--eval'))).toHaveLength(2)
    expect(await readdir(directory)).toEqual(['consumer-report.json'])
  }
  finally {
    await server.terminate()
    await rm(directory, { recursive: true, force: true })
  }
}, 120_000)
