import type { NightlyOptions, NightlyReport } from '../types'
import type { consumerRunner } from './run'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { sleep } from '../../registry'
import { registrySettings } from '../../registry/settings'
import { consumerPnpmOptions } from './environment'
import { ConsumerCommandError } from './run'

/** A confirmed upload can precede visibility in pnpm's installation packument. */
function missingBatchVersion(error: unknown, report: NightlyReport): boolean {
  if (!(error instanceof ConsumerCommandError) || error.command.exitCode === null) {
    return false
  }
  const expected = new Set(report.packages.flatMap(pkg => [`${pkg.name}@snapshot-nightly`, `${pkg.name}@${pkg.version}`]))
  let missing = false
  for (const line of `${error.command.stdout}\n${error.command.stderr}`.split('\n').filter(line => line.trim())) {
    let record: { level?: string, code?: string, message?: string, cause?: unknown, err?: { code?: string, message?: string, cause?: unknown } }
    try {
      record = JSON.parse(line)
    }
    catch {
      return false
    }
    if (!record || typeof record !== 'object') {
      return false
    }
    if (record.level !== 'error') {
      continue
    }
    const code = record.code ?? record.err?.code
    const message = record.message ?? record.err?.message
    if (code !== 'ERR_PNPM_NO_MATCHING_VERSION' || (record.err?.code !== undefined && record.err.code !== code) || typeof message !== 'string'
      || record.cause !== undefined || record.err?.cause !== undefined || (record.err?.message !== undefined && record.err.message !== message)) {
      return false
    }
    const reference = /^No matching version found for (\S+) while fetching it from https:\/\/registry\.npmjs\.org\/(?:\n\nFailed to resolve \1)?\s*$/u.exec(message)?.[1]
    // pnpm includes the dependency alias before its actual registry target.
    const target = reference?.replace(/^(?:@[^/@\s]+\/)?[^/@\s]+@npm:/u, '')
    if (!target || !expected.has(target)) {
      return false
    }
    missing = true
  }
  return missing
}

/** Retry installation only; accepted uploads and subsequent identity checks are never repeated. */
export async function installNightlyConsumer(report: NightlyReport, options: NightlyOptions, directory: string, run: ReturnType<typeof consumerRunner>) {
  const budget = report.provider === 'npm' ? Math.min(900_000, registrySettings(options).visibilityTimeoutMs) : 600_000
  const started = performance.now()
  let virtualWait = 0
  let delay = 2_000
  let attempt = 0
  let lastFailure: unknown
  const remaining = () => Math.max(0, budget - (performance.now() - started + virtualWait))
  while (remaining() >= 1) {
    const state = path.join(directory, `.pnpm-attempt-${attempt++}`)
    const timeout = Math.floor(Math.min(600_000, remaining()))
    if (timeout <= 0) {
      break
    }
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
      ], timeout)
      return
    }
    catch (error) {
      if (report.provider !== 'npm' || !missingBatchVersion(error, report)) {
        throw error
      }
      lastFailure = error
    }
    // Only discard paths created inside this consumer, never the user's/shared pnpm cache.
    await Promise.all(['node_modules', 'pnpm-lock.yaml', path.basename(state)].map(name => rm(path.join(directory, name), { recursive: true, force: true })))
    const wait = Math.min(delay, remaining())
    if (wait > 0) {
      const before = performance.now()
      await sleep(wait, options)
      virtualWait += Math.max(0, wait - (performance.now() - before))
    }
    delay = Math.min(delay * 2, 30_000)
  }
  throw new Error('Nightly consumer installation visibility timed out; the confirmed npm batch was not uploaded again.', { cause: lastFailure })
}
