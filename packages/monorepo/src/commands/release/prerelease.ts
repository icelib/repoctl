import type { ReleaseCiOptions, ReleaseOptions } from './types'
import { ReleaseCommandError } from './errors'
import { runQualityScripts, runReleaseHooks } from './hooks'
import { assertReleaseLineVersions, readReleaseBranches, resolveReleaseBranch } from './lines'
import { assertAppliedLine, assertPlannedLine, assertPreparedLine } from './lines/preview'
import { assertPreviousReleaseComplete } from './preparation/guard'
import { applyVersions } from './preparation/result'
import { getPublishCandidates, publishWithRetry } from './publish'
import { assertLaneAssignments, clearPublishSummary, hasGitChanges, hasPendingIntents, readPublishSummary, resolveBranch, run, runLane } from './shared'

export async function releasePrerelease(options: ReleaseCiOptions, publish?: () => Promise<import('./types').PublishedPackage[]>) {
  const rule = await resolveReleaseBranch(options)
  const branch = rule.branch
  if (rule.kind !== 'prerelease') {
    throw new ReleaseCommandError(`repo release pre requires a prerelease branch, got ${branch}`)
  }

  await assertLaneAssignments(rule.lane, options)
  if (!await hasPendingIntents(options.cwd)) {
    if (publish) {
      assertReleaseLineVersions(rule, await getPublishCandidates(options.cwd))
      await runQualityScripts(options)
    }
    return publish?.()
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
  if (!releases.length) {
    return
  }
  if (!hasGitChanges(options)) {
    throw new ReleaseCommandError('pnpm reported releases without file changes')
  }

  run('git', ['add', '-A'], options)
  run('git', ['commit', '-m', `chore(release): ${branch} [skip ci]`], options)
  if (publish) {
    run('git', ['push', 'origin', `HEAD:${branch}`], options)
    return publish()
  }
  runReleaseHooks('beforePublish', options)
  const candidates = await getPublishCandidates(options.cwd)
  assertReleaseLineVersions(rule, candidates)
  await clearPublishSummary(options.cwd)
  await publishWithRetry(
    ['publish', '-r', '--tag', rule.distTag, '--report-summary', '--provenance', '--no-git-checks'],
    options,
    candidates,
  )
  run('git', ['push', '--follow-tags', 'origin', `HEAD:${branch}`], options)
  return readPublishSummary(options.cwd)
}

export async function enterPrerelease(tag: string, options: ReleaseOptions) {
  const rules = await readReleaseBranches(options)
  const rule = rules.find(rule => rule.kind === 'prerelease' && rule.lane === tag)
  if (!rule) {
    throw new ReleaseCommandError(`unknown prerelease lane ${tag}; expected ${rules.filter(rule => rule.kind === 'prerelease').map(rule => rule.lane).join(', ')}`)
  }
  await runLane(rule.lane, options)
}

export async function exitPrerelease(options: ReleaseOptions) {
  const rules = await readReleaseBranches(options)
  const branch = resolveBranch(options)
  const current = rules.find(rule => rule.branch === branch)
  const target = rules.find(rule => rule.branch === current?.target) ?? rules.find(rule => rule.kind === 'stable')!
  await runLane(target.lane, options)
  return { branch: target.branch, lane: target.lane }
}
