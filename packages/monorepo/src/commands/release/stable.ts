import type { ReleaseCiOptions, ReleaseOptions } from './types'
import { ReleaseCommandError } from './errors'
import { runQualityScripts, runReleaseHooks } from './hooks'
import { assertPreviousReleaseComplete } from './preparation/guard'
import { applyVersions } from './preparation/result'
import { getPublishCandidates, publishWithRetry } from './publish'
import { assertStableLaneAssignments, clearPublishSummary, hasGitChanges, hasPendingIntents, readPublishSummary, resolveBranch } from './shared'

export async function prepareStableReleases(options: ReleaseCiOptions) {
  const branch = resolveBranch(options)
  if (branch !== 'main') {
    throw new ReleaseCommandError(`repo release stable prepare is only allowed on main, got ${branch}`)
  }
  await assertStableLaneAssignments(options)
  if (!await hasPendingIntents(options.cwd)) {
    return []
  }
  await assertPreviousReleaseComplete(options)
  runReleaseHooks('beforeVersion', options)
  await runQualityScripts(options)
  const releases = await applyVersions(options)
  runReleaseHooks('afterVersion', options)
  if (releases.length && !hasGitChanges(options)) {
    throw new ReleaseCommandError('pnpm reported releases without file changes')
  }
  return releases
}

export async function prepareStable(options: ReleaseOptions) {
  return (await prepareStableReleases(options)).length > 0
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
