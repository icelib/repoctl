import type { ReleaseOptions } from './types'
import { ReleaseCommandError } from './errors'
import { runQualityScripts, runReleaseHooks } from './hooks'
import { getPublishCandidates, publishWithRetry } from './publish'
import { assertStableLaneAssignments, clearPublishSummary, hasGitChanges, hasPendingIntents, readPublishSummary, resolveBranch, run } from './shared'

export async function prepareStable(options: ReleaseOptions) {
  const branch = resolveBranch(options)
  if (branch !== 'main') {
    throw new ReleaseCommandError(`repo release stable prepare is only allowed on main, got ${branch}`)
  }
  await assertStableLaneAssignments(options)
  if (!await hasPendingIntents(options.cwd)) {
    return false
  }
  runReleaseHooks('beforeVersion', options)
  await runQualityScripts(options)
  run('pnpm', ['version', '-r', '--no-git-checks'], options)
  runReleaseHooks('afterVersion', options)
  return hasGitChanges(options)
}

export async function assertStablePublish(options: ReleaseOptions, quality = true) {
  const branch = resolveBranch(options)
  if (branch !== 'main') {
    throw new ReleaseCommandError(`repo release stable publish is only allowed on main, got ${branch}`)
  }
  await assertStableLaneAssignments(options)
  if (await hasPendingIntents(options.cwd)) {
    throw new ReleaseCommandError('stable publish found unconsumed change intents; prepare and merge the Release PR before publishing')
  }
  if (quality) {
    await runQualityScripts(options)
  }
}

export async function publishStable(options: ReleaseOptions) {
  await assertStablePublish(options)
  runReleaseHooks('beforePublish', options)
  await clearPublishSummary(options.cwd)
  await publishWithRetry(
    ['publish', '-r', '--report-summary', '--provenance', '--no-git-checks'],
    options,
    await getPublishCandidates(options.cwd),
  )
  return readPublishSummary(options.cwd)
}

/** Compatibility entry point retained for existing generated repositories. */
export async function releaseStable(options: ReleaseOptions) {
  return publishStable(options)
}
