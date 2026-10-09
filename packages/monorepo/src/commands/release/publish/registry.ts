import type { PublishedPackage, ReleaseOptions } from '../types'
import type { PublishState } from './state'
import { performance } from 'node:perf_hooks'
import { logger } from '../../../core/logger'
import { ReleaseCommandError } from '../errors'
import { registryClient, sleep } from '../registry'
import { mapConcurrent, registrySettings } from '../registry/settings'
import { packageKey } from './state'

export { sleep } from '../registry'

export async function refreshRegistry(state: PublishState, options: ReleaseOptions, packages = state.candidates, deadline = performance.now() + registrySettings(options).visibilityTimeoutMs) {
  const unknown: PublishedPackage[] = []
  const client = registryClient(options)
  await mapConcurrent(state.unconfirmed(packages), registrySettings(options).concurrency, async (pkg) => {
    try {
      const remote = await client.inspect(pkg, deadline, 'version')
      if (remote) {
        state.confirm(pkg)
      }
    }
    catch (error) {
      if (error instanceof ReleaseCommandError && error.message.includes('authentication failed')) {
        throw error
      }
      unknown.push(pkg)
      logger.warn(error instanceof Error ? error.message : String(error))
    }
  })
  await state.save(options.cwd, 'confirming')
  return unknown
}

export async function confirmVisibility(state: PublishState, options: ReleaseOptions & { quiet?: boolean }, packages: PublishedPackage[], initialDelay = 0, distTag?: string) {
  const settings = registrySettings(options)
  const budget = settings.visibilityTimeoutMs
  const started = performance.now()
  let virtualWait = 0
  const elapsed = () => performance.now() - started + virtualWait
  const tagged = new Set<string>()
  const pending = () => distTag ? packages.filter(pkg => !tagged.has(packageKey(pkg))) : state.unconfirmed(packages)
  let delay = initialDelay
  let lastProgress = 0
  let pendingVersions = pending().map(packageKey).join(', ')
  if (pendingVersions && !options.quiet) {
    logger.info(`Waiting up to ${budget / 60_000} minutes for npm registry visibility${distTag ? ` and dist-tag ${distTag}` : ''}; pending versions: ${pendingVersions}`)
  }
  try {
    while (pending().length && elapsed() < budget) {
      const wait = Math.min(delay, budget - elapsed())
      if (wait) {
        const before = performance.now()
        await sleep(wait, options)
        virtualWait += Math.max(0, wait - (performance.now() - before))
      }
      if (elapsed() >= budget) {
        break
      }
      const queryStarted = performance.now()
      const deadline = queryStarted + Math.max(0, budget - elapsed())
      if (distTag) {
        await mapConcurrent(pending(), settings.concurrency, async (pkg) => {
          const remote = await registryClient(options).inspect(pkg, deadline)
          if (remote) {
            state.accept([pkg])
            if (remote['dist-tags']?.[distTag] === pkg.version) {
              state.confirm(pkg)
              tagged.add(packageKey(pkg))
            }
          }
        })
      }
      else {
        const unknown = await refreshRegistry(state, options, packages, deadline)
        if (unknown.length && elapsed() < budget) {
          throw new ReleaseCommandError(`npm registry state is unknown after bounded retries: ${unknown.map(packageKey).join(', ')}; upload evidence preserved`)
        }
      }
      await state.save(options.cwd, 'confirming')
      const next = pending().map(packageKey).join(', ')
      if (next && elapsed() < budget && !options.quiet && (next !== pendingVersions || elapsed() - lastProgress >= 60_000)) {
        logger.info(`Waiting for npm registry visibility (${Math.floor(elapsed() / 1_000)}s/${budget / 1_000}s); pending versions: ${next}`)
        lastProgress = elapsed()
      }
      pendingVersions = next
      delay = elapsed() < 30_000 ? 2_000 : elapsed() < 120_000 ? 5_000 : 10_000
    }
    if (pending().length) {
      throw new ReleaseCommandError(`npm registry visibility confirmation timed out after ${budget / 60_000} minutes; pending versions: ${pending().map(packageKey).join(', ')}${distTag ? ` (including dist-tag ${distTag})` : ''}. Upload evidence is preserved in repoctl-publish-progress.json; resume confirmation without re-uploading accepted versions.`)
    }
    if (packages.length && !options.quiet) {
      logger.info('npm registry visibility confirmed for all requested versions.')
    }
  }
  catch (error) {
    await state.save(options.cwd, 'failed')
    throw error
  }
}
