import type { consumerRunner } from '../../../nightly/consumer/run'
import type { PreparedSnapshotManifest } from '../types'
import type { SnapshotConsumerBudget } from './retry'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { consumerPnpmOptions } from '../../../nightly/consumer/environment'
import { missingRegistryVersion } from '../../../nightly/consumer/missing-version'
import { retrySnapshotVisibility } from './retry'

export async function installPreparedSnapshotConsumer(manifest: PreparedSnapshotManifest, directory: string, run: ReturnType<typeof consumerRunner>, budget: SnapshotConsumerBudget) {
  const versions = new Set(manifest.packages.map(pkg => `${pkg.name}@${pkg.version}`))
  await retrySnapshotVisibility(async (attempt) => {
    const state = path.join(directory, `.pnpm-attempt-${attempt}`)
    try {
      await run('pnpm', [
        ...consumerPnpmOptions,
        'install',
        '--ignore-scripts',
        '--no-frozen-lockfile',
        '--no-prefer-frozen-lockfile',
        '--no-prefer-offline',
        '--no-offline',
        '--registry=https://registry.npmjs.org/',
        '--reporter=ndjson',
        `--store-dir=${path.join(state, 'store')}`,
        `--state-dir=${path.join(state, 'state')}`,
        `--config.cache-dir=${path.join(state, 'cache')}`,
      ], Math.max(1, Math.floor(Math.min(600_000, budget.remaining()))))
    }
    catch (error) {
      if (missingRegistryVersion(error, versions)) {
        await Promise.all(['node_modules', 'pnpm-lock.yaml', path.basename(state)].map(name => rm(path.join(directory, name), { recursive: true, force: true })))
      }
      throw error
    }
  }, error => missingRegistryVersion(error, versions), budget)
}
