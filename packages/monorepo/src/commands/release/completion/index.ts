import type { ReleaseLifecycleState } from '../lifecycle/types'
import type { ReleaseBranchRule } from '../lines/types'
import type { ReleaseCiOptions } from '../types'
import type { ReleaseCompletionRecord, ReleaseCompletionResult } from './types'
import { spawnSync } from 'node:child_process'
import semver from 'semver'
import { loadMonorepoConfig } from '../../../core/config'
import { ReleaseCommandError } from '../errors'
import { inspectRegistry } from '../lifecycle/registry'
import { resolveGitHub } from '../metadata'
import { getPublishCandidates } from '../publish'
import { packageKey } from '../publish/state'
import { getReleaseEnv } from '../shared'
import { completionId, parseReleaseCompletion } from './record'

export { parseReleaseCompletion, readReleaseCompletion } from './record'
export type { ReleaseCompletionRecord, ReleaseCompletionResult } from './types'

function publishedSourceIsAncestor(options: ReleaseCiOptions, tag: string, sourceSha: string) {
  const result = (options.spawn ?? spawnSync)('git', ['merge-base', tag, sourceSha], {
    cwd: options.cwd,
    env: getReleaseEnv(options),
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.status === 0) {
    return result.stdout?.toString().trim() === tag
  }
  if (result.status === 1 && !result.error && !result.signal) {
    return false
  }
  throw new ReleaseCommandError(`Cannot inspect published source ancestry: ${tag}`, result.status ?? 1)
}

/** Only completed stable publication creates a durable documentation baseline. */
export async function recordReleaseCompletion(options: ReleaseCiOptions, state: ReleaseLifecycleState, checkpointKey: string, rule: ReleaseBranchRule): Promise<ReleaseCompletionResult | undefined> {
  if (rule.kind !== 'stable' || rule.branch !== 'main' || rule.distTag !== 'latest') {
    return
  }
  const config = await loadMonorepoConfig(options.cwd)
  const sites = Object.keys(config.commands?.docs?.sites ?? {}).sort()
  if (!sites.length) {
    return
  }
  if (!state.complete || state.npm !== 'complete' || !state.packages.length
    || state.packages.some(pkg => !state.metadata.includes(packageKey(pkg)))
    || Object.values(state.hooks).some(status => !['complete', 'ignored'].includes(status))) {
    throw new ReleaseCommandError('Documentation requires a complete stable release lifecycle')
  }
  const targets = [...new Set(state.packages.map(pkg => pkg.target))]
  const sourceSha = targets[0]
  if (targets.length !== 1 || !sourceSha || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    throw new ReleaseCommandError('Documentation requires one original source commit for the completed release cohort')
  }
  const candidates = await getPublishCandidates(options.cwd)
  const completedCandidates = state.candidates.map(packageKey).sort()
  if (JSON.stringify(candidates.map(packageKey).sort()) !== JSON.stringify(completedCandidates)) {
    // Package-only recovery cannot establish metadata and hook completion for the full batch.
    return
  }
  const github = resolveGitHub(options)
  if (!github.readAutomationState || !github.writeAutomationState || !github.readTagTarget) {
    throw new ReleaseCommandError('Documentation requires durable automation records and tag queries')
  }
  const packages: ReleaseCompletionRecord['packages'] = []
  const released = new Set(state.packages.map(pkg => pkg.name))
  for (const pkg of candidates) {
    if (semver.prerelease(pkg.version) && !released.has(pkg.name)) {
      continue
    }
    const published = await inspectRegistry(pkg, options)
    const tag = await github.readTagTarget(packageKey(pkg))
    if (!published || semver.prerelease(pkg.version) || !tag || !/^[a-f0-9]{40}$/.test(tag)
      || (published.gitHead && published.gitHead !== tag)) {
      if (released.has(pkg.name)) {
        throw new ReleaseCommandError(`Cannot establish published documentation source for ${packageKey(pkg)}`)
      }
      continue
    }
    // Every package source must belong to this frozen repository snapshot.
    if (!publishedSourceIsAncestor(options, tag, sourceSha)) {
      if (released.has(pkg.name)) {
        throw new ReleaseCommandError(`Published package source is outside the documentation baseline: ${packageKey(pkg)}`)
      }
      continue
    }
    packages.push({ ...pkg, sourceSha: tag })
  }
  packages.sort((a, b) => a.name.localeCompare(b.name))
  const value: Omit<ReleaseCompletionRecord, 'id'> = {
    schemaVersion: 1,
    repository: state.repository,
    branch: rule.branch,
    distTag: rule.distTag,
    sourceSha,
    packages,
    releasedPackages: state.packages.map(pkg => pkg.name).sort(),
    checkpointKey,
  }
  const record = parseReleaseCompletion({ ...value, id: completionId(value) }, completionId(value))
  const key = `releases/${record.id}`
  const existing = await github.readAutomationState(key)
  if (existing) {
    parseReleaseCompletion(existing.value, record.id)
  }
  else {
    await github.writeAutomationState(key, record)
  }
  return { record, sites }
}
