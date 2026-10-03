import type { ReleaseOptions } from '../types'
import type { ReleaseBranchRule } from './types'
import semver from 'semver'
import { resolveCommandConfig } from '../../../core/config'
import { ReleaseCommandError } from '../errors'
import { resolveBranch } from '../shared'
import { resolveReleaseBranches } from './config'

export { releasePullRequestHead, resolveReleaseBranches } from './config'
export type * from './types'

export async function readReleaseBranches(options: ReleaseOptions) {
  const config = options.config ?? await resolveCommandConfig('release', options.cwd)
  return resolveReleaseBranches(config?.branches)
}

export async function resolveReleaseBranch(options: ReleaseOptions): Promise<ReleaseBranchRule> {
  const rules = await readReleaseBranches(options)
  const branch = resolveBranch(options)
  const rule = rules.find(item => item.branch === branch)
  if (!rule) {
    throw new ReleaseCommandError(`No release branch rule for ${branch}; configured branches: ${rules.map(item => item.branch).join(', ')}`)
  }
  return rule
}

/** Validate the native result; repoctl never computes replacement versions. */
export function assertReleaseLineVersions(rule: ReleaseBranchRule, packages: Array<{ name: string, version: string }>) {
  for (const pkg of packages) {
    const parsed = semver.parse(pkg.version)
    if (!parsed) {
      throw new ReleaseCommandError(`Invalid release version for ${pkg.name}`)
    }
    const stableVersion = `${parsed.major}.${parsed.minor}.${parsed.patch}`
    const isPrerelease = parsed.prerelease.length > 0
    if ((rule.kind === 'prerelease') !== isPrerelease
      || (isPrerelease && parsed.prerelease[0] !== rule.lane)
      || !semver.satisfies(stableVersion, rule.range)
      || rule.excludedRanges.some(range => semver.satisfies(stableVersion, range))) {
      throw new ReleaseCommandError(`${pkg.name}@${pkg.version} is outside release line ${rule.branch} (${rule.range}, lane ${rule.lane}, tag ${rule.distTag})`)
    }
  }
}

export async function resolveStableReleaseBranch(options: ReleaseOptions, operation: string): Promise<ReleaseBranchRule> {
  const rules = await readReleaseBranches(options)
  const name = resolveBranch(options)
  const stable = rules.filter(rule => rule.kind !== 'prerelease')
  const selected = stable.find(rule => rule.branch === name)
  if (!selected) {
    throw new ReleaseCommandError(`repo release stable ${operation} is only allowed on ${stable.map(rule => rule.branch).join(', ')}, got ${name}`)
  }
  return selected
}
