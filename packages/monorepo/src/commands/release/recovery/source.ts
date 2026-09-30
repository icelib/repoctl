import type { ReleaseCiOptions } from '../types'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { resolveCommandConfig } from '../../../core/config'
import { clearWorkspaceCache } from '../../../core/workspace'
import { ReleaseCommandError } from '../errors'
import { runQualityScripts } from '../hooks'
import { publishLifecycle } from '../lifecycle'
import { releaseStateKey } from '../lifecycle/key'
import { resolveGitHub } from '../metadata'
import { getPublishCandidates } from '../publish'
import { packageKey } from '../publish/state'
import { capture, getReleaseEnv, hasPendingIntents, run } from '../shared'
import { readSourceCandidates } from './candidates'

/** Run current tooling against the original source, never today's package contents. */
export async function recoverSource(options: ReleaseCiOptions, source: string) {
  if (!/^[a-f0-9]{40}$/.test(source)) {
    throw new ReleaseCommandError('source-sha must be a full lowercase commit SHA')
  }
  const mode = options.mode ?? getReleaseEnv(options)['REPO_RELEASE_MODE'] ?? 'auto'
  if (!['publish', 'publish-unpublished'].includes(mode)) {
    throw new ReleaseCommandError('source-sha requires publish or publish-unpublished mode')
  }
  if (capture('git', ['rev-parse', '--is-shallow-repository'], options) !== 'false') {
    throw new ReleaseCommandError('Source recovery requires full Git history')
  }
  run('git', ['merge-base', '--is-ancestor', source, 'origin/main'], options)
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-release-source-'))
  const cwd = path.join(root, 'source')
  try {
    run('git', ['clone', '--shared', '--no-checkout', options.cwd, cwd], options)
    const env: NodeJS.ProcessEnv = { ...getReleaseEnv(options), GITHUB_SHA: source, GITHUB_REF_NAME: 'main', REPO_RELEASE_SOURCE_SHA: source }
    let recovery: ReleaseCiOptions = { ...options, cwd, branch: 'main', env }
    run('git', ['checkout', '--detach', source], recovery)
    clearWorkspaceCache()
    const workspaceCandidates = await getPublishCandidates(cwd)
    const candidates = await readSourceCandidates(recovery, source)
    if (!candidates.length) {
      throw new ReleaseCommandError('Source commit introduces no prepared release versions')
    }
    const name = options.packageName ?? env['REPO_RELEASE_PACKAGE']
    const version = options.packageVersion ?? env['REPO_RELEASE_VERSION']
    if ((name || version) && !candidates.some(pkg => pkg.name === name && pkg.version === version)) {
      throw new ReleaseCommandError('Requested package/version is not part of the source release')
    }
    if (await hasPendingIntents(cwd)) {
      throw new ReleaseCommandError('Source contains unconsumed release requests; select the merged version commit')
    }
    const github = resolveGitHub(options)
    let selected = candidates
    // Older automatic runs keyed checkpoints with the entire original workspace.
    // Reuse those exact keys so accepted uploads and completed hooks survive recovery.
    const repository = env['GITHUB_REPOSITORY']
    if (repository && github.readReleaseState) {
      const checkpoint = await github.readReleaseState(releaseStateKey(repository, 'latest', workspaceCandidates))
      if (checkpoint) {
        if (checkpoint.state.packages.some(pkg => pkg.target !== source || !candidates.some(item => packageKey(item) === packageKey(pkg)))) {
          throw new ReleaseCommandError('Existing checkpoint includes a different source release; recover its original candidate set')
        }
        selected = workspaceCandidates
      }
    }
    const dryRun = options.dryRun ?? env['REPO_RELEASE_DRY_RUN'] === 'true'
    if (!dryRun) {
      run('pnpm', ['install', '--frozen-lockfile'], recovery)
      const config = await resolveCommandConfig('release', cwd)
      recovery = { ...recovery, config: config ?? {} }
      await runQualityScripts(recovery)
    }
    else {
      // Use the dispatch configuration without executing historical config or hooks.
      recovery = { ...recovery, dryRun: true }
    }
    return await publishLifecycle({ ...recovery, github }, selected)
  }
  finally {
    for (const file of ['repoctl-publish-progress.json', 'repoctl-release-progress.json', 'pnpm-publish-summary.json']) {
      await copyFile(path.join(cwd, file), path.join(options.cwd, file)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') {
          throw error
        }
      })
    }
    clearWorkspaceCache()
    await rm(root, { recursive: true, force: true })
  }
}
