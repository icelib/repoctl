import type { GitHubOperations } from './github'
import type { ReleaseBodyMetadata } from './notes/model'
import type { ReleaseOptions } from './types'
import { spawnSync } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import path from 'pathe'
import { getWorkspacePackages } from '../../core/workspace'
import { buildGitHubReleaseBodyFromChangelog } from './body'
import { ReleaseCommandError } from './errors'
import { GitHubClient } from './github'
import { reconcileRelease } from './reconcile'
import { capture, getReleaseEnv } from './shared'

export interface RepairReleaseNotesOptions extends ReleaseOptions {
  tag?: string
  all?: boolean
  dryRun?: boolean
  createMissing?: boolean
  github?: Pick<GitHubOperations, 'listReleases' | 'updateRelease' | 'readReleasePullRequestContributors'>
}

function parseReleaseTag(tag: string) {
  const separator = tag.lastIndexOf('@')
  if (separator <= 0) {
    return undefined
  }
  const packageName = tag.slice(0, separator)
  const version = tag.slice(separator + 1)
  if (!/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i.test(version)) {
    return undefined
  }
  return { packageName, version }
}

function packagePath(cwd: string, rootDir: string) {
  return path.relative(cwd, rootDir).replaceAll('\\', '/')
}

async function findTaggedPackageDirectory(
  tag: string,
  packageName: string,
  currentDirectories: Map<string, string>,
  options: ReleaseOptions,
) {
  const currentDirectory = currentDirectories.get(packageName)
  if (currentDirectory) {
    return currentDirectory
  }

  let packageFiles: string[]
  try {
    packageFiles = capture('git', ['ls-tree', '-r', '--name-only', tag], options)
      .split(/\r?\n/)
      .filter(file => file === 'package.json' || file.endsWith('/package.json'))
  }
  catch {
    return undefined
  }

  for (const packageFile of packageFiles) {
    try {
      const manifest = JSON.parse(capture('git', ['show', `${tag}:${packageFile}`], options)) as { name?: unknown }
      if (manifest.name === packageName) {
        return packageFile === 'package.json' ? '.' : path.dirname(packageFile)
      }
    }
    catch {
      // Ignore malformed or removed package manifests in historical tags.
    }
  }
  return undefined
}

async function readTagChangelog(tag: string, relativePackagePath: string, options: ReleaseOptions) {
  const result = (options.spawn ?? spawnSync)('git', ['show', `${tag}:${relativePackagePath}/CHANGELOG.md`], {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0) {
    return undefined
  }
  return result.stdout?.toString().trim() || undefined
}

function releaseMetadata(options: ReleaseOptions): ReleaseBodyMetadata {
  const env = getReleaseEnv(options)
  return {
    ...(env['GITHUB_REPOSITORY'] ? { repository: env['GITHUB_REPOSITORY'] } : {}),
    ...(env['GITHUB_SERVER_URL'] ? { serverUrl: env['GITHUB_SERVER_URL'] } : {}),
  }
}

export async function repairReleaseNotes(options: RepairReleaseNotesOptions) {
  if (!options.all && !options.tag) {
    throw new ReleaseCommandError('release notes repair requires --all or --tag <package@version>')
  }
  const github = options.github ?? new GitHubClient()
  if (options.createMissing) {
    if (!options.tag) {
      throw new ReleaseCommandError('release notes repair --create-missing requires --tag <package@version>')
    }
    const separator = options.tag.lastIndexOf('@')
    if (separator <= 0) {
      throw new ReleaseCommandError(`invalid release tag ${options.tag}`)
    }
    const result = await reconcileRelease({
      ...options,
      packageName: options.tag.slice(0, separator),
      packageVersion: options.tag.slice(separator + 1),
      github: github as never,
    })
    return { repaired: result.repaired, skipped: result.skipped }
  }
  if (!github.listReleases || !github.updateRelease) {
    throw new ReleaseCommandError('GitHub release repair requires listReleases and updateRelease operations')
  }
  const releases = await github.listReleases()
  const selected = options.tag ? releases.filter(release => release.tag_name === options.tag) : releases
  const packages = await getWorkspacePackages(options.cwd)
  // Workspace discovery can resolve through /private on macOS while cwd uses /var.
  // Real paths keep the git tree path relative and portable across symlinked roots.
  const workspaceRoot = await realpath(options.cwd)
  const packageDirectories = new Map((await Promise.all(packages
    .filter(pkg => typeof pkg.manifest.name === 'string')
    .map(async (pkg) => {
      const rootDir = await realpath(pkg.rootDir)
      return [pkg.manifest.name as string, packagePath(workspaceRoot, rootDir)] as const
    }))))
  const metadata = releaseMetadata(options)
  const repaired: string[] = []
  const skipped: string[] = []

  for (const release of selected) {
    const parsed = parseReleaseTag(release.tag_name)
    if (!parsed) {
      skipped.push(release.tag_name)
      continue
    }
    let relativePath = await findTaggedPackageDirectory(release.tag_name, parsed.packageName, packageDirectories, options)
    let changelog = relativePath
      ? await readTagChangelog(release.tag_name, relativePath, options)
      : undefined
    if (!changelog) {
      relativePath = await findTaggedPackageDirectory(release.tag_name, parsed.packageName, new Map(), options)
      changelog = relativePath
        ? await readTagChangelog(release.tag_name, relativePath, options)
        : undefined
    }
    if (!changelog) {
      skipped.push(release.tag_name)
      continue
    }
    let releaseMetadataForBody = metadata
    if (release.target_commitish && github.readReleasePullRequestContributors) {
      try {
        const contributors = await github.readReleasePullRequestContributors(release.target_commitish)
        if (contributors.length) {
          releaseMetadataForBody = { ...metadata, contributors }
        }
      }
      catch {
        // Historical releases remain repairable from their changelog when PR metadata is unavailable.
      }
    }
    const body = buildGitHubReleaseBodyFromChangelog(parsed.packageName, parsed.version, changelog, releaseMetadataForBody)
    if (!options.dryRun && (release.name !== release.tag_name || release.body !== body)) {
      await github.updateRelease({ id: release.id, name: release.tag_name, body })
    }
    repaired.push(release.tag_name)
  }

  return { repaired, skipped }
}
