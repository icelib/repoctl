import type { GitHubOperations } from './github'
import type { PublishedPackage, ReleaseOptions } from './types'
import { spawnSync } from 'node:child_process'
import { getWorkspacePackages } from '../../core/workspace'
import { buildReleaseNoteDocument, renderGitHubRelease } from './body'
import { ReleaseCommandError } from './errors'
import { GitHubClient } from './github'
import { verifySource } from './lifecycle/identity'
import { inspectRegistry } from './lifecycle/registry'
import { getReleaseEnv } from './shared'

export interface ReleaseReconcileOptions extends ReleaseOptions {
  packageName?: string
  packageVersion?: string
  dryRun?: boolean
  github?: Pick<GitHubOperations, 'listReleases' | 'ensureRelease' | 'ensureTag' | 'readTagTarget' | 'enrichReleaseNote' | 'readReleasePullRequestContributors'>
}

function remoteTagTarget(tag: string, options: ReleaseOptions) {
  const result = (options.spawn ?? spawnSync)('git', ['ls-remote', '--exit-code', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`], {
    cwd: options.cwd,
    env: getReleaseEnv(options),
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  })
  if (result.status === 2) {
    return undefined
  }
  if (result.status !== 0) {
    throw new ReleaseCommandError(`Cannot query remote tag ${tag}; state is unknown`)
  }
  const refs = String(result.stdout ?? '').trim().split('\n')
  const resolved = refs.find(ref => ref.endsWith('^{}')) ?? refs[0]
  const sha = resolved?.split(/\s+/)[0]
  if (!sha || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new ReleaseCommandError(`Invalid remote tag response for ${tag}`)
  }
  return sha
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
  )).filter(pkg => (!options.packageName || pkg.name === options.packageName) && (!options.packageVersion || pkg.version === options.packageVersion))
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
  const publishedPackages: PublishedPackage[] = []
  for (const pkg of packages) {
    const published = await inspectRegistry(pkg, options)
    if (!published) {
      continue
    }
    publishedPackages.push(pkg)
    const target = published.gitHead ?? env['REPO_RELEASE_SOURCE_SHA'] ?? ''
    await verifySource(pkg, target, options)
    const tag = `${pkg.name}@${pkg.version}`
    const release = existing.get(tag)
    const packageDocument = {
      ...document,
      packages: document.packages.filter(item => item.name === pkg.name && item.version === pkg.version),
      entries: document.entries.filter(entry => entry.packageName === pkg.name && entry.version === pkg.version),
      compareUrls: document.compareUrls.filter(url => url.includes(encodeURIComponent(`${pkg.name}@`))),
    }
    const body = renderGitHubRelease(packageDocument)
    const tagTarget = github.readTagTarget ? await github.readTagTarget(tag) : remoteTagTarget(tag, options)
    if (tagTarget && tagTarget !== target) {
      throw new ReleaseCommandError(`Tag target conflict for ${tag}`)
    }
    const needsTag = !tagTarget
    const needsRelease = !release || release.name !== tag || release.body !== body
    if (!needsTag && !needsRelease) {
      continue
    }
    pending.push(tag)
    if (options.dryRun) {
      continue
    }
    if (needsTag && github.ensureTag) {
      await github.ensureTag({ tag, target })
    }
    await github.ensureRelease({ tag, target, name: tag, body })
    repaired.push(tag)
  }
  return { repaired, pending, skipped: publishedPackages.filter(pkg => !pending.includes(`${pkg.name}@${pkg.version}`)).map(pkg => `${pkg.name}@${pkg.version}`) }
}
