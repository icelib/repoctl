import type { ReleaseCiOptions, ReleaseOptions } from './types'
import { ReleaseCommandError } from './errors'
import { runQualityScripts, runReleaseHooks } from './hooks'
import { assertReleaseLineVersions, resolveStableReleaseBranch } from './lines'
import { assertAppliedLine, assertPlannedLine, assertPreparedLine } from './lines/preview'
import { assertPreviousReleaseComplete } from './preparation/guard'
import { applyVersions } from './preparation/result'
import { getPublishCandidates, publishWithRetry } from './publish'
import { assertStableLaneAssignments, clearPublishSummary, hasGitChanges, hasPendingIntents, readPublishSummary } from './shared'

export async function prepareStableReleases(options: ReleaseCiOptions) {
  const rule = await resolveStableReleaseBranch(options, 'prepare')
  await assertStableLaneAssignments(options)
  if (!await hasPendingIntents(options.cwd)) {
    return []
  }
  await assertPlannedLine(rule, options)
  await assertPreviousReleaseComplete(options, rule.distTag)
  runReleaseHooks('beforeVersion', options)
  await runQualityScripts(options)
  await assertPlannedLine(rule, options)
  const releases = await applyVersions(options)
  const publicReleases = await assertAppliedLine(rule, releases, options)
  runReleaseHooks('afterVersion', options)
  if (releases.length) {
    await assertPreparedLine(rule, publicReleases, options)
  }
  if (releases.length && !hasGitChanges(options)) {
    throw new ReleaseCommandError('pnpm reported releases without file changes')
  }
  return releases
}

export async function prepareStable(options: ReleaseOptions) {
  return (await prepareStableReleases(options)).length > 0
}

export async function assertStablePublish(options: ReleaseOptions, quality = true) {
  const rule = await resolveStableReleaseBranch(options, 'publish')
  assertReleaseLineVersions(rule, await getPublishCandidates(options.cwd))
  await assertStableLaneAssignments(options)
  if (await hasPendingIntents(options.cwd)) {
    throw new ReleaseCommandError('stable publish found unconsumed change intents; prepare and merge the Release PR before publishing')
  }
  if (quality) {
    await runQualityScripts(options)
  }
  return rule
}

export async function publishStable(options: ReleaseOptions) {
  const rule = await assertStablePublish(options)
  runReleaseHooks('beforePublish', options)
  const candidates = await getPublishCandidates(options.cwd)
  assertReleaseLineVersions(rule, candidates)
  await clearPublishSummary(options.cwd)
  await publishWithRetry(
    ['publish', '-r', '--report-summary', '--provenance', '--no-git-checks', ...(rule.distTag === 'latest' ? [] : ['--tag', rule.distTag])],
    options,
    candidates,
  )
  return readPublishSummary(options.cwd)
}

/** Compatibility entry point retained for existing generated repositories. */
export async function releaseStable(options: ReleaseOptions) {
  return publishStable(options)
}
