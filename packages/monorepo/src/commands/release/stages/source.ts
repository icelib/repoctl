import type { ReleaseCiOptions } from '../types'
import { mkdir, rm } from 'node:fs/promises'
import path from 'pathe'
import { resolveCommandConfig } from '../../../core/config'
import { clearWorkspaceCache } from '../../../core/workspace'
import { ReleaseCommandError } from '../errors'
import { releaseStateKey } from '../lifecycle/key'
import { assertReleaseLineVersions, resolveStableReleaseBranch } from '../lines'
import { resolveGitHub } from '../metadata'
import { getPublishCandidates } from '../publish'
import { packageKey } from '../publish/state'
import { readSourceCandidates } from '../recovery/candidates'
import { sourcePackageManagerEnvironment } from '../recovery/environment'
import { capture, getReleaseEnv, hasPendingIntents, resolveReleaseMode, run } from '../shared'
import { stageDirectory } from './receipt'

export async function stagedSource(options: ReleaseCiOptions, create = false, install = false) {
  const source = options.sourceSha ?? getReleaseEnv(options)['REPO_RELEASE_RECOVERY_SOURCE_SHA']?.trim()
  if (!source) {
    return { options, selected: undefined }
  }
  const mode = resolveReleaseMode(options)
  const rule = await resolveStableReleaseBranch(options, 'publish')
  if (!/^[a-f0-9]{40}$/.test(source) || !['publish', 'publish-unpublished'].includes(mode)) {
    throw new ReleaseCommandError('source-sha requires a full commit SHA and a publish mode')
  }
  if (capture('git', ['rev-parse', '--is-shallow-repository'], options) !== 'false') {
    throw new ReleaseCommandError('Source recovery requires full Git history')
  }
  run('git', ['merge-base', '--is-ancestor', source, `refs/remotes/origin/${rule.branch}`], options)
  const root = path.join(stageDirectory(options), 'source')
  const cwd = path.join(root, 'checkout')
  const env: NodeJS.ProcessEnv = { ...getReleaseEnv(options), REPO_RELEASE_SOURCE_SHA: source }
  let recovery: ReleaseCiOptions = { ...options, cwd, branch: rule.branch, env }
  if (create) {
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    run('git', ['clone', '--shared', '--no-checkout', options.cwd, cwd], options)
    run('git', ['remote', 'set-url', 'origin', capture('git', ['remote', 'get-url', 'origin'], options)], recovery)
    run('git', ['checkout', '--detach', source], recovery)
  }
  if (capture('git', ['rev-parse', 'HEAD'], recovery) !== source || capture('git', ['diff', '--binary', 'HEAD'], recovery)) {
    throw new ReleaseCommandError('Recovery checkout changed; restart at plan and verify')
  }
  clearWorkspaceCache()
  const candidates = await readSourceCandidates(recovery, source)
  assertReleaseLineVersions(rule, candidates)
  if (!candidates.length || await hasPendingIntents(cwd)) {
    throw new ReleaseCommandError('Source must contain prepared release versions and no pending intents')
  }
  const name = options.packageName ?? env['REPO_RELEASE_PACKAGE']
  const version = options.packageVersion ?? env['REPO_RELEASE_VERSION']
  if ((name || version) && !candidates.some(pkg => pkg.name === name && pkg.version === version)) {
    throw new ReleaseCommandError('Requested package/version is not part of the source release')
  }
  const github = resolveGitHub(options)
  let selected = candidates
  const workspace = await getPublishCandidates(cwd)
  const repository = env['GITHUB_REPOSITORY']
  if (repository && github.readReleaseState) {
    const checkpoint = await github.readReleaseState(releaseStateKey(repository, rule.distTag, workspace))
    if (checkpoint) {
      if (checkpoint.state.packages.some(pkg => pkg.target !== source || !candidates.some(item => packageKey(item) === packageKey(pkg)))) {
        throw new ReleaseCommandError('Existing checkpoint belongs to another source release')
      }
      selected = workspace
    }
  }
  if (!(options.dryRun ?? env['REPO_RELEASE_DRY_RUN'] === 'true')) {
    recovery = { ...recovery, env: await sourcePackageManagerEnvironment(recovery, root) }
    if (install) {
      run('pnpm', ['install', '--frozen-lockfile'], recovery)
    }
    if (!create || install) {
      const config = await resolveCommandConfig('release', cwd)
      recovery = { ...recovery, config: { ...config, branches: options.config?.branches ?? {} } }
    }
  }
  return { options: { ...recovery, github }, selected }
}
