import type { GitHubOperations } from './github'
import type { PublishedPackage, ReleaseCiOptions, ReleaseMode, ReleaseOptions } from './types'
import { spawnSync } from 'node:child_process'
import { logger } from '../../core/logger'
import { resolveRepoctlLocale } from '../../i18n'
import { buildReleaseNoteDocument, readPendingIntentCommits, readWorkspaceVersions, renderGitHubRelease, renderReleasePullRequest } from './body'
import { ReleaseCommandError } from './errors'
import { GitHubClient } from './github'
import { runAfterPublishHooks, runQualityScripts, runReleaseHooks } from './hooks'
import { releasePrerelease } from './prerelease'
import { publishWithRetry } from './publish'
import { reconcileRelease } from './reconcile'
import { capture, clearPublishSummary, getReleaseEnv, hasPendingIntents, readPublishSummary, resolveBranch, run } from './shared'
import { prepareStable, publishStable } from './stable'
import { readReleaseTriggerContext, shouldRunRelease } from './trigger'
import { prereleaseBranches } from './types'

const releaseBranch = 'release/pnpm-version'

function gitRefExists(ref: string, options: ReleaseOptions) {
  return (options.spawn ?? spawnSync)('git', ['rev-parse', '--verify', '--quiet', ref], {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: false,
    stdio: 'ignore',
  }).status === 0
}

function remoteTagExists(tag: string, options: ReleaseOptions) {
  return (options.spawn ?? spawnSync)('git', ['ls-remote', '--exit-code', '--refs', 'origin', `refs/tags/${tag}`], {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: false,
    stdio: 'ignore',
  }).status === 0
}

function resolveGitHub(options: ReleaseCiOptions): GitHubOperations {
  return options.github ?? new GitHubClient()
}

function resolveTarget(options: ReleaseOptions) {
  return getReleaseEnv(options)['GITHUB_SHA']?.trim() || capture('git', ['rev-parse', 'HEAD'], options)
}

function resolveReleaseLocale(options: ReleaseOptions) {
  return resolveRepoctlLocale({ env: getReleaseEnv(options) })
}

function formatPublishedPackageSummary(packages: PublishedPackage[]) {
  return [
    'Published packages:',
    ...(packages.length
      ? packages.map(pkg => `  - ${pkg.name}@${pkg.version}`)
      : ['  (none)']),
  ].join('\n')
}

async function publishMetadata(packages: PublishedPackage[], options: ReleaseCiOptions, prerelease = false) {
  if (!packages.length) {
    logger.success(formatPublishedPackageSummary(packages))
    return
  }
  const github = resolveGitHub(options)
  const target = resolveTarget(options)
  const releaseEnv = getReleaseEnv(options)
  let releaseContributors: string[] = []
  if (github.readReleasePullRequestContributors) {
    try {
      releaseContributors = await github.readReleasePullRequestContributors(target)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn(`GitHub release PR contributor lookup skipped: ${message}`)
    }
  }
  const metadata = {
    locale: resolveReleaseLocale(options),
    ...(releaseContributors.length ? { contributors: releaseContributors } : {}),
    ...(releaseEnv['GITHUB_REPOSITORY'] ? { repository: releaseEnv['GITHUB_REPOSITORY'] } : {}),
    ...(releaseEnv['GITHUB_SERVER_URL'] ? { serverUrl: releaseEnv['GITHUB_SERVER_URL'] } : {}),
  }
  const publishedPackageNames = new Set(packages.map(pkg => pkg.name))
  let noteDocument = await buildReleaseNoteDocument(options.cwd, undefined, metadata, publishedPackageNames)
  if (github.enrichReleaseNote) {
    noteDocument = await github.enrichReleaseNote(noteDocument)
  }
  for (const pkg of packages) {
    const tag = `${pkg.name}@${pkg.version}`
    const packageDocument = {
      ...noteDocument,
      packages: noteDocument.packages.filter(item => item.name === pkg.name && item.version === pkg.version),
      entries: noteDocument.entries.filter(entry => entry.packageName === pkg.name && entry.version === pkg.version),
      compareUrls: noteDocument.compareUrls.filter(url => url.includes(encodeURIComponent(`${pkg.name}@`))),
    }
    const body = renderGitHubRelease(packageDocument, metadata)
    if (github.ensureTag) {
      await github.ensureTag({ tag, target })
      await github.ensureRelease({ tag, target, prerelease, name: tag, body })
      continue
    }
    if (remoteTagExists(tag, options)) {
      await github.ensureRelease({ tag, target, prerelease, name: tag, body })
      continue
    }
    if (!gitRefExists(tag, options)) {
      run('git', ['tag', '-a', tag, '-m', tag], options)
    }
    run('git', ['push', 'origin', `refs/tags/${tag}`], options)
    await github.ensureRelease({ tag, target, prerelease, name: tag, body })
  }
  logger.success(formatPublishedPackageSummary(packages))
}

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

export async function releaseCi(options: ReleaseCiOptions) {
  const mode = resolveMode(options)
  if (mode === 'prepare') {
    await createReleasePullRequest(options)
    return
  }
  if (mode === 'publish') {
    const packages = await publishStable(options)
    await publishMetadata(packages, options)
    runAfterPublishHooks(packages, options)
    return packages
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
  const packages = await publishStable(options)
  await publishMetadata(packages, options)
  runAfterPublishHooks(packages, options)
  return packages
}

export { createReleasePullRequest, recoverUnpublished }
