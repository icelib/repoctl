import type { PackedManifest } from '../../../../package-check/types'
import type { PreparedSnapshotManifest } from '../types'
import type { SnapshotConsumerBudget } from './retry'
import type { PreparedSnapshotConsumerOptions } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readSnapshotArchive } from '../../archive'
import { validatePreparedSnapshot } from '../validate'
import { retrySnapshotVisibility, snapshotConsumerBudget } from './retry'

class RegistryVisibilityError extends Error {}

async function request(url: string, options: PreparedSnapshotConsumerOptions, budget: SnapshotConsumerBudget) {
  return retrySnapshotVisibility(async () => {
    const response = await (options.registryFetch ?? globalThis.fetch)(url, { redirect: 'error', signal: AbortSignal.timeout(Math.floor(Math.min(30_000, budget.remaining()))), headers: { 'cache-control': 'no-cache' } })
    if (!response.ok) {
      await response.body?.cancel()
      const ErrorType = response.status === 404 || response.status === 429 || response.status >= 500 ? RegistryVisibilityError : Error
      throw new ErrorType(`Snapshot consumer registry request failed: HTTP ${response.status}.`)
    }
    return response
  }, error => error instanceof RegistryVisibilityError, budget)
}

async function responseBytes(response: Response, limit: number) {
  const chunks: Uint8Array[] = []
  let size = 0
  if (!response.body) {
    throw new Error('Snapshot registry returned an empty response.')
  }
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > limit) {
      throw new Error('Snapshot consumer registry response exceeds the size limit.')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** Check actual registry bytes before installing or evaluating any candidate entry. */
export async function publishedSnapshotManifests(manifest: PreparedSnapshotManifest, options: PreparedSnapshotConsumerOptions, budget = snapshotConsumerBudget(options)): Promise<PackedManifest[]> {
  const files = new Map<string, Uint8Array>([['snapshot-manifest.json', Buffer.from(JSON.stringify(manifest))]])
  const manifests: PackedManifest[] = []
  for (const pkg of manifest.packages) {
    const metadata = JSON.parse((await responseBytes(await request(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`, options, budget), 8 * 1024 * 1024)).toString('utf8')) as { name?: string, version?: string, dist?: { integrity?: string, tarball?: string } }
    if (metadata.name !== pkg.name || metadata.version !== pkg.version || metadata.dist?.integrity !== pkg.integrity || !metadata.dist.tarball) {
      throw new Error(`Snapshot consumer registry identity or integrity differs for ${pkg.name}.`)
    }
    const url = new URL(metadata.dist.tarball)
    if (url.origin !== 'https://registry.npmjs.org' || url.username || url.password || url.search || url.hash) {
      throw new Error('Snapshot consumer requires tarballs from the official npm registry.')
    }
    const bytes = await responseBytes(await request(url.href, options, budget), 256 * 1024 * 1024)
    if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== pkg.integrity) {
      throw new Error(`Snapshot consumer downloaded different bytes for ${pkg.name}.`)
    }
    files.set(pkg.tarball, bytes)
  }
  await validatePreparedSnapshot(manifest, manifest.plan, files)
  for (const pkg of manifest.packages) {
    const entries = await readSnapshotArchive(files.get(pkg.tarball)!)
    manifests.push(JSON.parse(entries.find(entry => entry.path === 'package/package.json')!.data.toString('utf8')))
  }
  return manifests
}
