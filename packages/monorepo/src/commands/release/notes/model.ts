import type { RepoctlLocale } from '../../../i18n'
import YAML from 'yaml'

export type ReleaseCategory = 'breaking' | 'features' | 'fixes' | 'performance' | 'docs' | 'maintenance' | 'other'

export interface ReleaseCommit {
  sha: string
  subject: string
  body?: string
  author?: string
  packages?: string[]
  summary?: string
  summaries?: string[]
}

export interface ReleaseBodyMetadata {
  commits?: ReleaseCommit[]
  repository?: string
  serverUrl?: string
  contributors?: string[]
  locale?: RepoctlLocale
  compact?: boolean
}

export interface ReleaseNoteEntry {
  packageName: string
  version: string
  npmUrl?: string
  category: ReleaseCategory
  summary: string
  details?: string
  commits: ReleaseCommit[]
  pullRequests: number[]
  issues: number[]
  authors: string[]
}

export interface ReleaseNotePackage {
  name: string
  version: string
  previousVersion?: string
  npmUrl?: string
  previousNpmUrl?: string
  changelogPath?: string
}

export interface ReleaseNoteDocument {
  packages: ReleaseNotePackage[]
  entries: ReleaseNoteEntry[]
  contributors: string[]
  compareUrls: string[]
}

export interface ReleaseNoteGroup {
  category: ReleaseCategory
  summary: string
  entries: ReleaseNoteEntry[]
  packageNames: string[]
  commits: ReleaseCommit[]
  pullRequests: number[]
  issues: number[]
  authors: string[]
}

export interface PackageReleaseSource {
  name: string
  version: string
  previousVersion?: string
  npmUrl?: string
  content: string
}

export const categoryOrder: ReleaseCategory[] = [
  'breaking',
  'features',
  'fixes',
  'performance',
  'docs',
  'other',
  'maintenance',
]

export const categoryTitles: Record<ReleaseCategory, string> = {
  breaking: '🚨 Breaking Changes',
  features: '🚀 Features',
  fixes: '🐞 Bug Fixes',
  performance: '🏎 Performance',
  docs: '📚 Documentation',
  maintenance: '🧰 Maintenance',
  other: '🧩 Other Changes',
}

export const zhCNCategoryTitles: Record<ReleaseCategory, string> = {
  breaking: '🚨 破坏性变更',
  features: '🚀 新功能',
  fixes: '🐞 问题修复',
  performance: '🏎 性能优化',
  docs: '📚 文档',
  maintenance: '🧰 维护',
  other: '🧩 其他变更',
}

export function readVersionSection(changelog: string, version: string) {
  const versions = [...changelog.matchAll(/^## ([^\n]+)$/gm)]
  const index = versions.findIndex(match => match[1] === version)
  const current = versions[index]
  if (index < 0 || !current || current.index === undefined) {
    return undefined
  }

  const end = versions[index + 1]?.index ?? changelog.length
  const section = changelog.slice(current.index, end).trim()
  return {
    content: section.slice(current[0].length).trim() || undefined,
    previousVersion: versions[index + 1]?.[1],
  }
}

function readIntentSections(content: string) {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return undefined
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) {
    return undefined
  }
  return { frontmatter: lines.slice(1, end).join('\n'), summary: lines.slice(end + 1).join('\n').trim() }
}

export function parseIntentPackages(content: string) {
  const sections = readIntentSections(content)
  if (!sections) {
    return []
  }
  try {
    const frontmatter = YAML.parse(sections.frontmatter)
    if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
      return []
    }
    return Object.keys(frontmatter).filter(key => key !== 'summary' && key !== 'type')
  }
  catch {
    return []
  }
}

export function parseIntentSummary(content: string) {
  return readIntentSections(content)?.summary ?? content.trim()
}

export function uniqueCommits(commits: ReleaseCommit[]) {
  const merged = new Map<string, ReleaseCommit>()
  for (const commit of commits) {
    const existing = merged.get(commit.sha)
    if (!existing) {
      merged.set(commit.sha, commit)
      continue
    }
    merged.set(commit.sha, {
      ...existing,
      packages: [...new Set([...(existing.packages ?? []), ...(commit.packages ?? [])])],
      summaries: [...new Set([
        existing.summary,
        ...(existing.summaries ?? []),
        commit.summary,
        ...(commit.summaries ?? []),
      ].filter((summary): summary is string => Boolean(summary)))],
    })
  }
  return [...merged.values()]
}

export function isAutomationContributor(value: string) {
  return /github-actions|dependabot|renovate|\[bot\]$/i.test(value)
}

/** Normalizes contributor text emitted by changelog and GitHub Markdown. */
export function normalizeContributor(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:\*{1,3}|_{1,3})\s*/, '')
    .replace(/\s*(?:\*{1,3}|_{1,3})\s*$/, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function uniqueContributors(contributors: readonly string[]) {
  const unique = new Map<string, string>()
  for (const contributor of contributors) {
    const normalized = normalizeContributor(contributor)
    if (!normalized || isAutomationContributor(normalized)) {
      continue
    }
    const key = normalized.replace(/^@/, '').toLocaleLowerCase()
    if (!unique.has(key)) {
      unique.set(key, normalized)
    }
  }
  return [...unique.values()]
}

export function buildPackageCompareUrl(release: PackageReleaseSource, metadata: ReleaseBodyMetadata) {
  if (!release.previousVersion || !metadata.repository || !/^[^/]+\/[^/]+$/.test(metadata.repository)) {
    return undefined
  }
  const serverUrl = (metadata.serverUrl || 'https://github.com').replace(/\/$/, '')
  const previousTag = encodeURIComponent([release.name, release.previousVersion].join('@'))
  const currentTag = encodeURIComponent([release.name, release.version].join('@'))
  return [serverUrl, metadata.repository, 'compare', `${previousTag}...${currentTag}`].join('/')
}

export function buildNpmPackageUrl(name: string, version: string) {
  const packagePath = name.startsWith('@') ? name : encodeURIComponent(name)
  return `https://www.npmjs.com/package/${packagePath}/v/${encodeURIComponent(version)}`
}
