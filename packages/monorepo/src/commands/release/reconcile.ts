import type { GitHubOperations } from './github'
import type { PublishedPackage, ReleaseOptions } from './types'
import { spawnSync } from 'node:child_process'
import { getWorkspacePackages } from '../../core/workspace'
import { buildReleaseNoteDocument, renderGitHubRelease } from './body'
import { GitHubClient } from './github'
import { capture, getReleaseEnv } from './shared'

export interface ReleaseReconcileOptions extends ReleaseOptions {
  packageName?: string
  packageVersion?: string
  dryRun?: boolean
  github?: Pick<GitHubOperations, 'listReleases' | 'ensureRelease' | 'ensureTag' | 'enrichReleaseNote' | 'readReleasePullRequestContributors'>
}

function remoteTagExists(tag: string, options: ReleaseOptions) {
  return (options.spawn ?? spawnSync)('git', ['ls-remote', '--exit-code', '--refs', 'origin', `refs/tags/${tag}`], {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: false,
    stdio: 'ignore',
  }).status === 0
}

function resolveTarget(options: ReleaseOptions) {
  return getReleaseEnv(options)['GITHUB_SHA']?.trim() || capture('git', ['rev-parse', 'HEAD'], options)
}

function isPublished(pkg: PublishedPackage, options: ReleaseOptions) {
  const result = (options.spawn ?? spawnSync)('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return result.status === 0 && String(result.stdout ?? '').trim() === pkg.version
}

export async function reconcileRelease(options: ReleaseReconcileOptions) {
  const github = options.github ?? new GitHubClient()
  if (!github.listReleases || !github.ensureRelease) {
    throw new Error('GitHub release reconcile requires listReleases and ensureRelease operations')
  }
  const releases = await github.listReleases()
  const existing = new Map(releases.map(release => [release.tag_name, release]))
  const workspacePackages = await getWorkspacePackages(options.cwd)
  const packages: PublishedPackage[] = workspacePackages.flatMap(({ manifest }) => (
    typeof manifest.name === 'string' && typeof manifest.version === 'string'
      ? [{ name: manifest.name, version: manifest.version }]
      : []
  )).filter(pkg => (!options.packageName || pkg.name === options.packageName) && (!options.packageVersion || pkg.version === options.packageVersion)).filter(pkg => isPublished(pkg, options))
  const env = getReleaseEnv(options)
  const metadata: { repository?: string, serverUrl?: string } = {}
  if (env['GITHUB_REPOSITORY']) {
    metadata.repository = env['GITHUB_REPOSITORY']
  }
  if (env['GITHUB_SERVER_URL']) {
    metadata.serverUrl = env['GITHUB_SERVER_URL']
  }
  const document = await buildReleaseNoteDocument(options.cwd, undefined, metadata, new Set(packages.map(pkg => pkg.name)))
  const repaired: string[] = []
  const pending: string[] = []
  for (const pkg of packages) {
    const tag = `${pkg.name}@${pkg.version}`
    const release = existing.get(tag)
    const packageDocument = {
      ...document,
      packages: document.packages.filter(item => item.name === pkg.name && item.version === pkg.version),
      entries: document.entries.filter(entry => entry.packageName === pkg.name && entry.version === pkg.version),
      compareUrls: document.compareUrls.filter(url => url.includes(encodeURIComponent(`${pkg.name}@`))),
    }
    const body = renderGitHubRelease(packageDocument)
    const needsTag = !remoteTagExists(tag, options)
    const needsRelease = !release || release.name !== tag || release.body !== body
    if (!needsTag && !needsRelease) {
      continue
    }
    pending.push(tag)
    if (options.dryRun) {
      continue
    }
    if (needsTag && github.ensureTag) {
      await github.ensureTag({ tag, target: resolveTarget(options) })
    }
    await github.ensureRelease({ tag, target: resolveTarget(options), name: tag, body })
    repaired.push(tag)
  }
  return { repaired, pending, skipped: packages.filter(pkg => !pending.includes(`${pkg.name}@${pkg.version}`)).map(pkg => `${pkg.name}@${pkg.version}`) }
}
