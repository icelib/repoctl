import type { PublishedPackage, ReleaseOptions } from '../types'
import type { PublishState } from './state'
import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { logger } from '../../../core/logger'
import { ReleaseCommandError } from '../errors'
import { getReleaseEnv } from '../shared'
import { outputText } from './evidence'
import { packageKey } from './state'

const visibilityBudget = 300_000
const pollInterval = 10_000

export function sleep(milliseconds: number, options: ReleaseOptions) {
  return options.sleep?.(milliseconds) ?? new Promise<void>(resolve => setTimeout(resolve, milliseconds))
}

export async function refreshRegistry(state: PublishState, options: ReleaseOptions, packages = state.candidates, deadline = performance.now() + visibilityBudget) {
  for (const pkg of state.unconfirmed(packages)) {
    const remaining = Math.floor(deadline - performance.now())
    if (remaining <= 0) {
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
  }
}

export async function confirmVisibility(state: PublishState, options: ReleaseOptions, packages: PublishedPackage[], initialDelay = 0) {
  let remaining = visibilityBudget
  let delay = initialDelay
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
    delay = pollInterval
  }
  const pending = state.unconfirmed(packages)
  if (pending.length) {
    throw new ReleaseCommandError(`npm registry visibility confirmation timed out after 5 minutes; pending versions: ${pending.map(packageKey).join(', ')}`)
  }
  if (packages.length) {
    logger.info('npm registry visibility confirmed for all requested versions.')
  }
}
