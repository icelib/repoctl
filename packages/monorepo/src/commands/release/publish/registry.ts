import type { PublishedPackage, ReleaseOptions } from '../types'
import type { PublishState } from './state'
import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { logger } from '../../../core/logger'
import { ReleaseCommandError } from '../errors'
import { getReleaseEnv } from '../shared'
import { outputText } from './evidence'
import { packageKey } from './state'

// npm may accept an upload several minutes before the version becomes queryable.
const visibilityBudget = 15 * 60_000
const refreshBudget = 5 * 60_000
const pollInterval = 10_000
const progressInterval = 60_000

export function sleep(milliseconds: number, options: ReleaseOptions) {
  return options.sleep?.(milliseconds) ?? new Promise<void>(resolve => setTimeout(resolve, milliseconds))
}

export async function refreshRegistry(state: PublishState, options: ReleaseOptions, packages = state.candidates, deadline = performance.now() + refreshBudget) {
  const unknown: PublishedPackage[] = []
  const pending = state.unconfirmed(packages)
  for (const [index, pkg] of pending.entries()) {
    const remaining = Math.floor(deadline - performance.now())
    if (remaining <= 0) {
      unknown.push(...pending.slice(index))
      break
    }
    const result = (options.spawn ?? spawnSync)('npm', ['view', packageKey(pkg), 'version'], {
      cwd: options.cwd,
      encoding: 'utf8',
      env: getReleaseEnv(options),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: Math.min(10_000, remaining),
      killSignal: 'SIGKILL',
    })
    if (result.status === 0 && outputText(result.stdout).trim() === pkg.version) {
      state.confirm(pkg)
      await state.save(options.cwd, 'confirming')
    }
    else if (result.error || result.status === 0 || !/\bE404\b/.test(outputText(result.stderr))) {
      unknown.push(pkg)
    }
  }
  return unknown
}

export async function confirmVisibility(state: PublishState, options: ReleaseOptions & { quiet?: boolean }, packages: PublishedPackage[], initialDelay = 0) {
  let remaining = visibilityBudget
  let delay = initialDelay
  let lastProgress = 0
  let pendingVersions = state.unconfirmed(packages).map(packageKey).join(', ')
  if (pendingVersions && !options.quiet) {
    logger.info(`Waiting up to ${visibilityBudget / 60_000} minutes for npm registry visibility; pending versions: ${pendingVersions}`)
  }
  while (state.unconfirmed(packages).length && remaining > 0) {
    const started = performance.now()
    const wait = Math.min(delay, remaining)
    if (wait) {
      await sleep(wait, options)
    }
    // Count injected sleeps as well as real elapsed time, so tests need no wall-clock waits.
    remaining -= Math.max(wait, performance.now() - started)
    const queryStarted = performance.now()
    await refreshRegistry(state, options, packages, queryStarted + remaining)
    await state.save(options.cwd, 'confirming')
    remaining -= performance.now() - queryStarted
    const elapsed = visibilityBudget - remaining
    const nextPendingVersions = state.unconfirmed(packages).map(packageKey).join(', ')
    if (nextPendingVersions && remaining > 0 && !options.quiet
      && (nextPendingVersions !== pendingVersions || elapsed - lastProgress >= progressInterval)) {
      logger.info(`Waiting for npm registry visibility (${Math.floor(elapsed / 1_000)}s/${visibilityBudget / 1_000}s); pending versions: ${nextPendingVersions}`)
      lastProgress = elapsed
    }
    pendingVersions = nextPendingVersions
    delay = pollInterval
  }
  const pending = state.unconfirmed(packages)
  if (pending.length) {
    throw new ReleaseCommandError(`npm registry visibility confirmation timed out after ${visibilityBudget / 60_000} minutes; pending versions: ${pending.map(packageKey).join(', ')}. Upload evidence is preserved in repoctl-publish-progress.json; resume confirmation without re-uploading accepted versions.`)
  }
  if (packages.length && !options.quiet) {
    logger.info('npm registry visibility confirmed for all requested versions.')
  }
}
