import type { ReleaseCiOptions } from './types'
import { resolveCommandConfig } from '../../core/config'
import { logger } from '../../core/logger'
import { buildReleaseNoteDocument, readPendingIntentCommits, renderReleasePullRequest } from './body'
import { ReleaseCommandError } from './errors'
import { runAfterPublishHooks, runQualityScripts, runReleaseHooks } from './hooks'
import { publishLifecycle } from './lifecycle'
import { assertReleaseLineVersions, releasePullRequestHead, resolveReleaseBranch, resolveStableReleaseBranch } from './lines'
import { publishMetadata, resolveGitHub, resolveReleaseLocale } from './metadata'
import { runReleaseOidcAudit } from './oidc'
import { releasePrerelease } from './prerelease'
import { getPublishCandidates, publishWithRetry } from './publish'
import { reconcileRelease } from './reconcile'
import { recoverSource } from './recovery/source'
import { capture, clearPublishSummary, getReleaseEnv, hasPendingIntents, readPublishSummary, resolveReleaseMode, run } from './shared'
import { assertStablePublish, prepareStableReleases, publishStable } from './stable'
import { releaseCiStage } from './stages'
import { readReleaseTriggerContext, shouldRunRelease } from './trigger'

async function createReleasePullRequest(options: ReleaseCiOptions) {
  const rule = await resolveStableReleaseBranch(options, 'prepare')
  const releaseBranch = releasePullRequestHead(rule)

  const sourceCommits = await readPendingIntentCommits(options)
  const github = resolveGitHub(options)
  const releases = await prepareStableReleases({ ...options, github })
  if (!releases.length) {
    return false
  }

  const releaseEnv = getReleaseEnv(options)
  const metadata = {
    locale: resolveReleaseLocale(options),
    commits: sourceCommits,
    ...(releaseEnv['GITHUB_REPOSITORY'] ? { repository: releaseEnv['GITHUB_REPOSITORY'] } : {}),
    ...(releaseEnv['GITHUB_SERVER_URL'] ? { serverUrl: releaseEnv['GITHUB_SERVER_URL'] } : {}),
  }
  // Native versioning also updates root/private packages; only publish candidates need release notes.
  const candidates = new Set((await getPublishCandidates(options.cwd)).map(pkg => pkg.name))
  const noteReleases = releases.filter(release => candidates.has(release.name))
  const names = new Set(noteReleases.map(release => release.name))
  const previousVersions = new Map(noteReleases.filter(release => release.currentVersion !== release.newVersion)
    .map(release => [release.name, release.currentVersion]))
  let noteDocument = await buildReleaseNoteDocument(options.cwd, previousVersions, metadata, names)
  for (const release of noteReleases) {
    const pkg = noteDocument.packages.find(pkg => pkg.name === release.name && pkg.version === release.newVersion)
    if (!pkg || !noteDocument.entries.some(entry => entry.packageName === pkg.name)) {
      throw new ReleaseCommandError(`Missing release notes for ${release.name}@${release.newVersion}; no PR pushed`)
    }
    if (release.currentVersion === release.newVersion) {
      delete pkg.previousVersion
      delete pkg.previousNpmUrl
    }
  }
  if (github.enrichReleaseNote) {
    noteDocument = await github.enrichReleaseNote(noteDocument)
  }
  run('git', ['config', 'user.name', 'github-actions[bot]'], options)
  run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], options)
  run('git', ['checkout', '-B', releaseBranch], options)
  run('git', ['add', '-A'], options)
  run('git', ['commit', '-m', 'chore(release): version packages'], options)
  run('git', ['push', '--force', 'origin', `HEAD:${releaseBranch}`], options)

  await github.ensurePullRequest({
    head: releaseBranch,
    base: rule.branch,
    title: resolveReleaseLocale(options) === 'zh-CN'
      ? 'chore(release): 更新包版本'
      : 'chore(release): version packages',
    body: renderReleasePullRequest(noteDocument, metadata),
  })
  await github.closeLegacyReleasePullRequests?.({ head: `changeset-release/${rule.branch}`, base: rule.branch })
  return true
}

async function recoverUnpublished(options: ReleaseCiOptions) {
  const rule = await assertStablePublish(options, false)
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
    return publishLifecycle({ ...options, github }, [{ name: packageName, version: packageVersion }], rule.distTag)
  }
  runReleaseHooks('beforePublish', options)
  const actual = await getPublishCandidates(options.cwd)
  assertReleaseLineVersions(rule, actual)
  if (!actual.some(pkg => pkg.name === packageName && pkg.version === packageVersion)) {
    throw new ReleaseCommandError('Recovery package version changed during beforePublish hooks; no upload started')
  }
  await clearPublishSummary(options.cwd)
  await publishWithRetry(
    ['publish', '-r', '--filter', packageName, '--report-summary', '--provenance', '--no-git-checks', ...(rule.distTag === 'latest' ? [] : ['--tag', rule.distTag])],
    options,
    [{ name: packageName, version: packageVersion }],
    true,
  )
  const packages = await readPublishSummary(options.cwd)
  await publishMetadata(packages, options)
  runAfterPublishHooks(packages, options)
  return packages
}

async function publishStableCi(options: ReleaseCiOptions) {
  const github = resolveGitHub(options)
  if (github.readReleaseState && github.writeReleaseState) {
    const rule = await assertStablePublish(options, !(options.dryRun ?? getReleaseEnv(options)['REPO_RELEASE_DRY_RUN'] === 'true'))
    return publishLifecycle({ ...options, github }, undefined, rule.distTag)
  }
  // 保留旧的程序化 GitHub adapter；跨 runner 恢复需要状态读写能力。
  const packages = await publishStable(options)
  await publishMetadata(packages, options)
  runAfterPublishHooks(packages, options)
  return packages
}

export async function releaseCi(options: ReleaseCiOptions) {
  const mode = resolveReleaseMode(options)
  if (mode === 'oidc-audit') {
    return runReleaseOidcAudit(options)
  }
  options = { ...options, config: options.config ?? await resolveCommandConfig('release', options.cwd) ?? {} }
  if (options.stage && options.stage !== 'all') {
    return releaseCiStage(options)
  }
  const source = options.sourceSha ?? getReleaseEnv(options)['REPO_RELEASE_RECOVERY_SOURCE_SHA']?.trim()
  if (source) {
    return recoverSource({ ...options, mode }, source)
  }
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
    throw new ReleaseCommandError(`unknown release CI mode ${mode}; expected auto, prepare, publish, publish-unpublished, reconcile, or oidc-audit`)
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

  const rule = await resolveReleaseBranch(options)
  if (rule.kind === 'prerelease') {
    const github = resolveGitHub(options)
    if (github.readReleaseState && github.writeReleaseState) {
      if (options.dryRun ?? getReleaseEnv(options)['REPO_RELEASE_DRY_RUN'] === 'true') {
        if (await hasPendingIntents(options.cwd)) {
          throw new ReleaseCommandError('Prerelease dry-run requires an already prepared version commit')
        }
        assertReleaseLineVersions(rule, await getPublishCandidates(options.cwd))
        return publishLifecycle({ ...options, github }, undefined, rule.distTag)
      }
      return releasePrerelease({ ...options, github }, () => publishLifecycle({
        ...options,
        github,
        env: { ...getReleaseEnv(options), GITHUB_SHA: capture('git', ['rev-parse', 'HEAD'], options) },
      }, undefined, rule.distTag))
    }
    const packages = await releasePrerelease(options)
    if (!packages) {
      return
    }
    await publishMetadata(packages, options, true)
    runAfterPublishHooks(packages, options)
    return packages
  }
  if (await hasPendingIntents(options.cwd)) {
    await createReleasePullRequest(options)
    return
  }
  return publishStableCi(options)
}

export { createReleasePullRequest, recoverUnpublished }
