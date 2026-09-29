import type { GitHubOperations } from './github'
import type { PublishedPackage, ReleaseCiOptions, ReleaseOptions } from './types'
import { spawnSync } from 'node:child_process'
import { logger } from '../../core/logger'
import { resolveRepoctlLocale } from '../../i18n'
import { buildReleaseNoteDocument, renderGitHubRelease } from './body'
import { GitHubClient } from './github'
import { capture, getReleaseEnv, run } from './shared'

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

export function resolveGitHub(options: ReleaseCiOptions): GitHubOperations {
  const env = getReleaseEnv(options)
  return options.github ?? new GitHubClient({
    ...(env['GITHUB_TOKEN'] ? { token: env['GITHUB_TOKEN'] } : {}),
    ...(env['GITHUB_REPOSITORY'] ? { repository: env['GITHUB_REPOSITORY'] } : {}),
    ...(env['GITHUB_API_URL'] ? { apiUrl: env['GITHUB_API_URL'] } : {}),
  })
}

function resolveTarget(options: ReleaseOptions) {
  return getReleaseEnv(options)['GITHUB_SHA']?.trim() || capture('git', ['rev-parse', 'HEAD'], options)
}

export function resolveReleaseLocale(options: ReleaseOptions) {
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

export async function publishMetadata(packages: PublishedPackage[], options: ReleaseCiOptions, prerelease = false) {
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
