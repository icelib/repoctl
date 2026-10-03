import type { AppliedRelease } from '../preparation/result'
import type { ReleaseOptions } from '../types'
import type { ReleaseBranchRule } from './types'
import { clearWorkspaceCache, getWorkspacePackages } from '../../../core/workspace'
import { ReleaseCommandError } from '../errors'
import { nativePlan } from '../plan/native'
import { getPublishCandidates } from '../publish'
import { assertReleaseLineVersions } from './index'

export async function assertAppliedLine(rule: ReleaseBranchRule, releases: AppliedRelease[], options: ReleaseOptions) {
  const names = new Set((await getPublishCandidates(options.cwd)).map(pkg => pkg.name))
  const publicReleases = releases.filter(pkg => names.has(pkg.name))
  assertReleaseLineVersions(rule, publicReleases.map(pkg => ({ name: pkg.name, version: pkg.newVersion })))
  return publicReleases
}

/** Every constrained line must be checked using pnpm's read-only solver before version writes. */
export async function assertPlannedLine(rule: ReleaseBranchRule, options: ReleaseOptions) {
  if (rule.range === '*' && !rule.excludedRanges.length) {
    return
  }
  const plan = nativePlan(options)
  await assertProjectedLine(rule, plan.packages, options)
}

/** Hooks can build artifacts, but cannot silently replace pnpm's applied public versions. */
export async function assertPreparedLine(rule: ReleaseBranchRule, releases: AppliedRelease[], options: ReleaseOptions) {
  const actual = await getPublishCandidates(options.cwd)
  assertReleaseLineVersions(rule, actual)
  if (releases.some(release => !actual.some(pkg => release.name === pkg.name && release.newVersion === pkg.version))) {
    throw new ReleaseCommandError('Prepared release versions changed during afterVersion hooks; no release commit will be pushed')
  }
}

/** Unchanged public packages are uploaded too, so validate the complete predicted candidate set. */
export async function assertProjectedLine(rule: ReleaseBranchRule, releases: AppliedRelease[], options: ReleaseOptions) {
  clearWorkspaceCache()
  const workspace = await getWorkspacePackages(options.cwd)
  const planned = new Map(releases.map(pkg => [pkg.name, pkg.newVersion]))
  const candidates = workspace.flatMap(({ manifest }) => typeof manifest.name === 'string' && typeof manifest.version === 'string'
    ? [{ name: manifest.name, version: planned.get(manifest.name) ?? manifest.version }]
    : [])
  assertReleaseLineVersions(rule, candidates)
}
