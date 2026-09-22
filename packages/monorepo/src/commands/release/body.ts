import type { ReleaseBodyMetadata, ReleaseCommit, ReleaseNoteDocument } from './notes/model'
import type { ReleaseOptions } from './types'
import { readdir, readFile } from 'node:fs/promises'
import path from 'pathe'
import { getWorkspacePackages } from '../../core/workspace'
import { buildEntries } from './notes/entries'
import {
  buildNpmPackageUrl,
  buildPackageCompareUrl,
  parseIntentPackages,
  parseIntentSummary,
  readVersionSection,
  uniqueCommits,
  uniqueContributors,
} from './notes/model'
import { renderGitHubRelease, renderReleasePullRequest } from './notes/render'
import { capture } from './shared'

interface PackageJsonVersion {
  name?: unknown
  version?: unknown
  private?: unknown
}

interface PackageRelease {
  name: string
  version: string
  previousVersion?: string
  npmUrl?: string
  private?: boolean
  content: string
}

async function readPackageRelease(name: string, version: string, rootDir: string): Promise<PackageRelease | undefined> {
  let changelog: string
  try {
    changelog = await readFile(path.join(rootDir, 'CHANGELOG.md'), 'utf8')
  }
  catch {
    return undefined
  }

  const section = readVersionSection(changelog, version)
  if (!section?.content) {
    return undefined
  }
  return {
    name,
    version,
    ...(section.previousVersion ? { previousVersion: section.previousVersion } : {}),
    content: section.content,
  }
}

/** Captures source commits and package ownership before pnpm consumes intents. */
export async function readPendingIntentCommits(options: ReleaseOptions) {
  let entries
  try {
    entries = await readdir(path.join(options.cwd, '.changeset'), { withFileTypes: true })
  }
  catch {
    return []
  }

  const commits: ReleaseCommit[] = []
  for (const entry of entries) {
    if (!entry.isFile() || entry.name === 'README.md' || !entry.name.endsWith('.md')) {
      continue
    }
    try {
      const intentPath = `.changeset/${entry.name}`
      const intentContent = await readFile(path.join(options.cwd, intentPath), 'utf8')
      const packages = parseIntentPackages(intentContent)
      const summary = parseIntentSummary(intentContent)
      const sha = capture('git', ['log', '-1', '--format=%H', '--', intentPath], options)
      if (!sha) {
        continue
      }
      const metadata = capture('git', ['show', '-s', '--format=%H%x1F%s%x1F%b', sha], options)
      const [fullSha, subject, body] = metadata.split('\x1F')
      if (fullSha) {
        commits.push({
          sha: fullSha,
          subject: subject ?? '',
          body: body ?? '',
          ...(packages.length ? { packages } : {}),
          ...(summary ? { summary } : {}),
        })
      }
    }
    catch {
      // Missing metadata in a shallow checkout must not block version preparation.
    }
  }
  return uniqueCommits(commits)
}

export async function readWorkspaceVersions(cwd: string) {
  const packages = await getWorkspacePackages(cwd)
  const versions = new Map<string, string>()
  for (const pkg of packages) {
    try {
      const manifest = JSON.parse(await readFile(pkg.pkgJsonPath, 'utf8')) as PackageJsonVersion
      if (typeof manifest.name === 'string' && typeof manifest.version === 'string') {
        versions.set(manifest.name, manifest.version)
      }
    }
    catch {
      // pnpm versioning reports malformed workspace manifests.
    }
  }
  return versions
}

function buildReleasePackage(release: PackageRelease) {
  const packageLinks: { npmUrl?: string, previousNpmUrl?: string } = {}
  if (!release.private) {
    packageLinks.npmUrl = release.npmUrl ?? buildNpmPackageUrl(release.name, release.version)
    if (release.previousVersion) {
      packageLinks.previousNpmUrl = buildNpmPackageUrl(release.name, release.previousVersion)
    }
  }
  return {
    name: release.name,
    version: release.version,
    ...(release.previousVersion ? { previousVersion: release.previousVersion } : {}),
    ...packageLinks,
  }
}

function buildReleaseNoteDocumentFromReleases(releases: PackageRelease[], metadata: ReleaseBodyMetadata) {
  const entries = releases.flatMap(release => buildEntries(release, metadata.commits ?? []))
  const contributors = uniqueContributors([
    ...(metadata.contributors ?? []),
    ...entries.flatMap(entry => entry.authors),
  ])
  const compareUrls = releases
    .map(release => buildPackageCompareUrl(release, metadata))
    .filter((url): url is string => Boolean(url))

  return {
    packages: releases.map(buildReleasePackage),
    entries,
    contributors,
    compareUrls,
  } satisfies ReleaseNoteDocument
}

export async function buildReleaseNoteDocument(
  cwd: string,
  previousVersions?: Map<string, string>,
  metadata: ReleaseBodyMetadata = {},
  packageNames?: ReadonlySet<string>,
) {
  const workspacePackages = await getWorkspacePackages(cwd)
  const releases: PackageRelease[] = []
  for (const pkg of workspacePackages) {
    let manifest: PackageJsonVersion
    try {
      manifest = JSON.parse(await readFile(pkg.pkgJsonPath, 'utf8')) as PackageJsonVersion
    }
    catch {
      continue
    }
    if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
      continue
    }
    if (packageNames && !packageNames.has(manifest.name)) {
      continue
    }
    if (previousVersions?.get(manifest.name) === manifest.version) {
      continue
    }
    const release = await readPackageRelease(manifest.name, manifest.version, pkg.rootDir)
    if (release) {
      const previousVersion = previousVersions?.get(manifest.name) || release.previousVersion
      releases.push({
        ...release,
        ...(manifest.private === true
          ? { private: true }
          : { npmUrl: buildNpmPackageUrl(manifest.name, manifest.version) }),
        ...(previousVersion ? { previousVersion } : {}),
      })
    }
  }

  return buildReleaseNoteDocumentFromReleases(releases, metadata)
}

export function buildGitHubReleaseBodyFromChangelog(
  packageName: string,
  packageVersion: string,
  changelog: string,
  metadata: ReleaseBodyMetadata = {},
) {
  const section = readVersionSection(changelog, packageVersion)
  if (!section?.content) {
    return renderGitHubRelease({ packages: [], entries: [], contributors: [], compareUrls: [] }, metadata)
  }
  const release: PackageRelease = {
    name: packageName,
    version: packageVersion,
    ...(section.previousVersion ? { previousVersion: section.previousVersion } : {}),
    npmUrl: buildNpmPackageUrl(packageName, packageVersion),
    content: section.content,
  }
  return renderGitHubRelease(buildReleaseNoteDocumentFromReleases([release], metadata), metadata)
}

export async function buildReleasePullRequestBody(
  cwd: string,
  previousVersions?: Map<string, string>,
  metadata: ReleaseBodyMetadata = {},
) {
  const document = await buildReleaseNoteDocument(cwd, previousVersions, metadata)
  return renderReleasePullRequest(document, metadata)
}

export async function buildGitHubReleaseBody(
  cwd: string,
  packageName: string,
  packageVersion: string,
  metadata: ReleaseBodyMetadata = {},
) {
  const document = await buildReleaseNoteDocument(cwd, undefined, metadata, new Set([packageName]))
  const filtered: ReleaseNoteDocument = {
    ...document,
    packages: document.packages.filter(pkg => pkg.name === packageName && pkg.version === packageVersion),
    entries: document.entries.filter(entry => entry.packageName === packageName && entry.version === packageVersion),
    compareUrls: document.compareUrls.filter(url => url.includes(encodeURIComponent(`${packageName}@`))),
  }
  return renderGitHubRelease(filtered, metadata)
}

export { renderGitHubRelease, renderReleasePullRequest }
export type {
  ReleaseBodyMetadata,
  ReleaseCategory,
  ReleaseCommit,
  ReleaseNoteDocument,
  ReleaseNoteEntry,
} from './notes/model'
