import type { ReleaseCiOptions, ReleaseMode } from './types'
import { logger } from '../../core/logger'
import { buildReleaseNoteDocument, readPendingIntentCommits, readWorkspaceVersions, renderReleasePullRequest } from './body'
import { ReleaseCommandError } from './errors'
import { runAfterPublishHooks, runQualityScripts, runReleaseHooks } from './hooks'
import { publishLifecycle } from './lifecycle'
import { publishMetadata, resolveGitHub, resolveReleaseLocale } from './metadata'
import { releasePrerelease } from './prerelease'
import { publishWithRetry } from './publish'
import { reconcileRelease } from './reconcile'
import { capture, clearPublishSummary, getReleaseEnv, hasPendingIntents, readPublishSummary, resolveBranch, run } from './shared'
import { assertStablePublish, prepareStable, publishStable } from './stable'
import { readReleaseTriggerContext, shouldRunRelease } from './trigger'
import { prereleaseBranches } from './types'

const releaseBranch = 'release/pnpm-version'

async function createReleasePullRequest(options: ReleaseCiOptions) {
  const branch = resolveBranch(options)
  if (branch !== 'main') {
    throw new ReleaseCommandError(`repo release stable prepare is only allowed on main, got ${branch}`)
  }

  const previousVersions = await readWorkspaceVersions(options.cwd)
  const sourceCommits = await readPendingIntentCommits(options)
  const hasChanges = await prepareStable(options)
  if (!hasChanges) {
    return false
  }

  run('git', ['config', 'user.name', 'github-actions[bot]'], options)
  run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], options)
  run('git', ['checkout', '-B', releaseBranch], options)
  run('git', ['add', '-A'], options)
  run('git', ['commit', '-m', 'chore(release): version packages'], options)
  run('git', ['push', '--force', 'origin', `HEAD:${releaseBranch}`], options)

  const github = resolveGitHub(options)
  const releaseEnv = getReleaseEnv(options)
  const metadata = {
    locale: resolveReleaseLocale(options),
    commits: sourceCommits,
    ...(releaseEnv['GITHUB_REPOSITORY'] ? { repository: releaseEnv['GITHUB_REPOSITORY'] } : {}),
    ...(releaseEnv['GITHUB_SERVER_URL'] ? { serverUrl: releaseEnv['GITHUB_SERVER_URL'] } : {}),
  }
  let noteDocument = await buildReleaseNoteDocument(options.cwd, previousVersions, metadata)
  if (github.enrichReleaseNote) {
    noteDocument = await github.enrichReleaseNote(noteDocument)
  }
  await github.ensurePullRequest({
    head: releaseBranch,
    base: 'main',
    title: resolveReleaseLocale(options) === 'zh-CN'
      ? 'chore(release): 更新包版本'
      : 'chore(release): version packages',
    body: renderReleasePullRequest(noteDocument, metadata),
  })
  await github.closeLegacyReleasePullRequests?.({ head: 'changeset-release/main', base: 'main' })
  return true
}

async function recoverUnpublished(options: ReleaseCiOptions) {
  const packageName = options.packageName || getReleaseEnv(options)['REPO_RELEASE_PACKAGE']?.trim()
  const packageVersion = options.packageVersion || getReleaseEnv(options)['REPO_RELEASE_VERSION']?.trim()
  if (!packageName || !packageVersion) {
    throw new ReleaseCommandError('publish-unpublished requires REPO_RELEASE_PACKAGE and REPO_RELEASE_VERSION')
  }
  if (await hasPendingIntents(options.cwd)) {
    throw new ReleaseCommandError('publish-unpublished found unconsumed change intents; prepare and merge the Release PR before publishing')
  }

  const actualVersion = capture('pnpm', ['--filter', packageName, 'exec', 'node', '-p', 'require(\'./package.json\').version'], options)
  if (actualVersion !== packageVersion) {
    throw new ReleaseCommandError(`expected ${packageName}@${packageVersion} in the workspace, found ${actualVersion}`)
  }

  await runQualityScripts(options)
  const github = resolveGitHub(options)
  if (github.readReleaseState && github.writeReleaseState) {
    return publishLifecycle({ ...options, github }, [{ name: packageName, version: packageVersion }])
  }
  runReleaseHooks('beforePublish', options)
  await clearPublishSummary(options.cwd)
  await publishWithRetry(
    ['publish', '-r', '--filter', packageName, '--report-summary', '--provenance', '--no-git-checks'],
    options,
    [{ name: packageName, version: packageVersion }],
    true,
  )
  const packages = await readPublishSummary(options.cwd)
  await publishMetadata(packages, options)
  runAfterPublishHooks(packages, options)
  return packages
}

function resolveMode(options: ReleaseCiOptions): ReleaseMode {
  const requested = options.mode || getReleaseEnv(options)['REPO_RELEASE_MODE']?.trim() as ReleaseMode | undefined
  if (requested && requested !== 'auto') {
    return requested
  }
  return 'auto'
}

async function publishStableCi(options: ReleaseCiOptions) {
  const github = resolveGitHub(options)
  if (github.readReleaseState && github.writeReleaseState) {
    await assertStablePublish(options, !(options.dryRun ?? getReleaseEnv(options)['REPO_RELEASE_DRY_RUN'] === 'true'))
    return publishLifecycle({ ...options, github })
  }
  // 保留旧的程序化 GitHub adapter；跨 runner 恢复需要状态读写能力。
  const packages = await publishStable(options)
  await publishMetadata(packages, options)
  runAfterPublishHooks(packages, options)
  return packages
}

export async function releaseCi(options: ReleaseCiOptions) {
  const mode = resolveMode(options)
  if (mode === 'prepare') {
    await createReleasePullRequest(options)
    return
  }
  if (mode === 'publish') {
    return publishStableCi(options)
  }
  if (mode === 'publish-unpublished') {
    return recoverUnpublished(options)
  }
  if (mode === 'reconcile') {
    return reconcileRelease({ ...options, dryRun: options.dryRun ?? getReleaseEnv(options)['REPO_RELEASE_DRY_RUN'] === 'true' })
  }
  if (mode !== 'auto') {
    throw new ReleaseCommandError(`unknown release CI mode ${mode}; expected auto, prepare, publish, publish-unpublished, or reconcile`)
  }

  // GitHub push events use the same trigger contract as Changesets. Local and
  // programmatic calls without a GitHub event keep the historical auto behavior.
  const eventName = getReleaseEnv(options)['GITHUB_EVENT_NAME']?.trim()
  if (eventName && eventName !== 'workflow_dispatch') {
    const trigger = await readReleaseTriggerContext(options)
    if (!shouldRunRelease(trigger)) {
      logger.info('No release trigger detected; skipping release CI.')
      return
    }
  }

  const branch = resolveBranch(options)
  if (prereleaseBranches.has(branch)) {
    const github = resolveGitHub(options)
    if (github.readReleaseState && github.writeReleaseState) {
      if (options.dryRun ?? getReleaseEnv(options)['REPO_RELEASE_DRY_RUN'] === 'true') {
        if (await hasPendingIntents(options.cwd)) {
          throw new ReleaseCommandError('Prerelease dry-run requires an already prepared version commit')
        }
        return publishLifecycle({ ...options, github }, undefined, branch)
      }
      return releasePrerelease(options, () => publishLifecycle({
        ...options,
        github,
        env: { ...getReleaseEnv(options), GITHUB_SHA: capture('git', ['rev-parse', 'HEAD'], options) },
      }, undefined, branch))
    }
    const packages = await releasePrerelease(options)
    if (!packages) {
      return
    }
    await publishMetadata(packages, options, true)
    runAfterPublishHooks(packages, options)
    return packages
  }
  if (branch !== 'main') {
    throw new ReleaseCommandError(`repo release ci only supports main, alpha, beta, rc, or next branches, got ${branch}`)
  }
  if (await hasPendingIntents(options.cwd)) {
    await createReleasePullRequest(options)
    return
  }
  return publishStableCi(options)
}

export { createReleasePullRequest, recoverUnpublished }
