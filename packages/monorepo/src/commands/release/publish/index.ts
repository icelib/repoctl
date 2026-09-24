import type { PublishedPackage, ReleaseOptions } from '../types'
import { logger } from '../../../core/logger'
import { clearWorkspaceCache, getWorkspacePackages } from '../../../core/workspace'
import { ReleaseCommandError } from '../errors'
import { readPublishSummary } from '../shared'
import { runPublishAttempt } from './command'
import { acceptedFromOutput, isPublishConflict, isTransientPublishFailure } from './evidence'
import { confirmVisibility, refreshRegistry, sleep } from './registry'
import { packageKey, PublishState } from './state'

const publishAttempts = 3
const retryDelays = [20_000, 40_000]

export async function getPublishCandidates(cwd: string): Promise<PublishedPackage[]> {
  // Versioning and hooks may have updated manifests since the quality checks scanned them.
  clearWorkspaceCache()
  const packages = await getWorkspacePackages(cwd)
  const candidates = packages.flatMap(({ manifest }) => (
    typeof manifest.name === 'string' && typeof manifest.version === 'string'
      ? [{ name: manifest.name, version: manifest.version }]
      : []
  ))
  if (!candidates.length) {
    throw new ReleaseCommandError('no versioned publishable workspace packages were found')
  }
  return candidates
}

/** Only pnpm uploads; accepted versions never re-enter its retry filters. */
export async function publishWithRetry(args: string[], options: ReleaseOptions, candidates: PublishedPackage[], confirmAll = false) {
  const state = new PublishState(candidates)
  let attemptArgs = args
  let recovering = confirmAll
  try {
    await state.save(options.cwd, 'publishing')
    for (let attempt = 1; attempt <= publishAttempts; attempt += 1) {
      const result = runPublishAttempt(attemptArgs, options)
      state.accept(acceptedFromOutput(result.output, candidates))
      state.accept(await readPublishSummary(options.cwd))
      await state.save(options.cwd, 'publishing')

      if (result.status === 0) {
        await confirmVisibility(state, options, recovering ? candidates : state.acceptedPackages)
        await state.save(options.cwd, 'complete')
        return
      }

      recovering = true
      await refreshRegistry(state, options)
      await state.save(options.cwd, 'publishing')
      const transient = isTransientPublishFailure(result.output)
      const conflict = isPublishConflict(result.output)
      if (!transient && !conflict) {
        throw new ReleaseCommandError(`command failed: pnpm ${args.join(' ')}`, result.status ?? 1)
      }
      if (!state.pendingUploads.length || (conflict && !transient)) {
        await confirmVisibility(state, options, candidates, state.unconfirmed(candidates).length ? 20_000 : 0)
        await state.save(options.cwd, 'complete')
        return
      }
      if (attempt === publishAttempts) {
        throw new ReleaseCommandError(`command failed after ${publishAttempts} publish attempts: pnpm ${args.join(' ')}`, result.status ?? 1)
      }

      const delay = retryDelays[attempt - 1]!
      logger.warn(`npm publish transient failure; reconciling before retry in ${delay / 1000}s (attempt ${attempt + 1}/${publishAttempts}).`)
      await sleep(delay, options)
      await refreshRegistry(state, options)
      await state.save(options.cwd, 'publishing')
      if (!state.pendingUploads.length) {
        await confirmVisibility(state, options, candidates)
        await state.save(options.cwd, 'complete')
        return
      }
      attemptArgs = [...args, ...state.pendingUploads.flatMap(pkg => ['--filter', pkg.name])]
    }
  }
  catch (error) {
    await state.save(options.cwd, 'failed')
    logger.error(`npm publish progress saved to repoctl-publish-progress.json; accepted but unconfirmed: ${state.unconfirmed().map(packageKey).join(', ') || '(none)'}; still requiring upload: ${state.pendingUploads.map(packageKey).join(', ') || '(none)'}`)
    throw error
  }
}
