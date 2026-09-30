import type { ReleaseOptions } from './types'
import { ReleaseCommandError } from './errors'
import { runQualityScripts, runReleaseHooks } from './hooks'
import { applyVersions } from './preparation/result'
import { getPublishCandidates, publishWithRetry } from './publish'
import { assertLaneAssignments, clearPublishSummary, hasGitChanges, hasPendingIntents, readPublishSummary, resolveBranch, run, runLane } from './shared'
import { prereleaseBranches } from './types'

export async function releasePrerelease(options: ReleaseOptions, publish?: () => Promise<import('./types').PublishedPackage[]>) {
  const branch = resolveBranch(options)
  if (!prereleaseBranches.has(branch)) {
    throw new ReleaseCommandError(`repo release pre is only allowed on alpha, beta, rc, or next branches, got ${branch}`)
  }

  await assertLaneAssignments(branch, options)
  if (!await hasPendingIntents(options.cwd)) {
    if (publish) {
      await runQualityScripts(options)
    }
    return publish?.()
  }

  runReleaseHooks('beforeVersion', options)
  await runQualityScripts(options)
  const releases = await applyVersions(options)
  runReleaseHooks('afterVersion', options)
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
  await clearPublishSummary(options.cwd)
  await publishWithRetry(
    ['publish', '-r', '--tag', branch, '--report-summary', '--provenance', '--no-git-checks'],
    options,
    await getPublishCandidates(options.cwd),
  )
  run('git', ['push', '--follow-tags', 'origin', `HEAD:${branch}`], options)
  return readPublishSummary(options.cwd)
}

export async function enterPrerelease(tag: string, options: ReleaseOptions) {
  if (!prereleaseBranches.has(tag)) {
    throw new ReleaseCommandError(`unknown prerelease lane ${tag}; expected alpha, beta, rc, or next`)
  }
  await runLane(tag, options)
}

export async function exitPrerelease(options: ReleaseOptions) {
  await runLane('main', options)
}
