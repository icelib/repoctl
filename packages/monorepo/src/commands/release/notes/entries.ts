import type { PackageReleaseSource, ReleaseCategory, ReleaseCommit, ReleaseNoteEntry } from './model'
import { uniqueCommits, uniqueContributors } from './model'

function parseReferences(commits: ReleaseCommit[], content: string) {
  const pullRequests = new Set<number>()
  const issues = new Set<number>()
  for (const message of [...commits.map(commit => [commit.subject, commit.body ?? ''].join('\n')), content]) {
    for (const match of message.matchAll(/\]\([^)]*\/pull\/(\d+)\)/g)) {
      pullRequests.add(Number(match[1]))
    }
    for (const match of message.matchAll(/\]\([^)]*\/issues\/(\d+)\)/g)) {
      issues.add(Number(match[1]))
    }
    for (const match of message.matchAll(/\(#(\d+)\)/g)) {
      pullRequests.add(Number(match[1]))
    }
    for (const match of message.matchAll(/(?:^|\W)#(\d+)\b/g)) {
      const number = Number(match[1])
      if (!pullRequests.has(number)) {
        issues.add(number)
      }
    }
    for (const match of message.matchAll(/\bGH[- ]?(\d+)\b/gi)) {
      issues.add(Number(match[1]))
    }
  }
  for (const number of pullRequests) {
    issues.delete(number)
  }
  return {
    issues: [...issues].sort((a, b) => a - b),
    pullRequests: [...pullRequests].sort((a, b) => a - b),
  }
}

function sourceCategory(commits: ReleaseCommit[]) {
  for (const commit of commits) {
    const subject = commit.subject.toLowerCase()
    const conventional = /^([a-z]+)(?:\([^)]*\))?(!)?:/.exec(subject)
    if (conventional?.[2] || subject.startsWith('breaking')) {
      return 'breaking' as const
    }
    if (conventional?.[1] === 'feat' || conventional?.[1] === 'feature' || subject.includes('🚀')) {
      return 'features' as const
    }
    if (conventional?.[1] === 'fix' || subject.includes('🐛') || subject.includes('🐞')) {
      return 'fixes' as const
    }
    if (conventional?.[1] === 'perf' || subject.includes('🏎')) {
      return 'performance' as const
    }
    if (['doc', 'docs', 'documentation'].includes(conventional?.[1] ?? '') || subject.includes('📚')) {
      return 'docs' as const
    }
    if (['chore', 'ci', 'test', 'refactor', 'dep', 'deps'].includes(conventional?.[1] ?? '') || /dependencies|maintenance/i.test(subject)) {
      return 'maintenance' as const
    }
  }
  return undefined
}

function classifyChange(heading: string, summary: string, commits: ReleaseCommit[]): ReleaseCategory {
  if (/dependenc(?:y|ies)/i.test(heading)) {
    return 'maintenance'
  }
  const fromCommit = sourceCategory(commits)
  if (fromCommit) {
    return fromCommit
  }
  const categoryHint = [heading, summary].join(' ').toLowerCase()
  if (/major|breaking|重大|破坏/.test(categoryHint)) {
    return 'breaking'
  }
  if (/minor|feature|🚀|新增|功能/.test(categoryHint)) {
    return 'features'
  }
  if (/fix|bug|🐛|🐞|修复|错误|问题/.test(categoryHint)) {
    return 'fixes'
  }
  if (/perf|🏎|性能/.test(categoryHint)) {
    return 'performance'
  }
  if (/doc|📚|文档/.test(categoryHint)) {
    return 'docs'
  }
  if (/dependenc|chore|ci|test|refactor|maintenance|📦|依赖|维护/.test(categoryHint)) {
    return 'maintenance'
  }
  return 'other'
}

function readMarkdownEntries(content: string) {
  const headings = [...content.matchAll(/^### ([^\n]+)$/gm)]
  if (!headings.length) {
    return [{ heading: 'Patch Changes', summary: content.trim() }]
  }

  const entries: Array<{ heading: string, summary: string }> = []
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index]
    if (!heading || heading.index === undefined) {
      continue
    }
    const start = heading.index + heading[0].length
    const end = headings[index + 1]?.index ?? content.length
    const lines = content.slice(start, end).trim().split('\n')
    let current = ''
    for (const line of lines) {
      if (line.startsWith('- ')) {
        if (current) {
          entries.push({ heading: heading[1] as string, summary: current.trim() })
        }
        current = line.slice(2).trim()
      }
      else if (line.trim()) {
        current = current ? [current, line.trim()].join('\n') : line.trim()
      }
    }
    if (current) {
      entries.push({ heading: heading[1] as string, summary: current.trim() })
    }
  }
  return entries.length ? entries : [{ heading: 'Patch Changes', summary: content.trim() }]
}

interface NormalizedMarkdownEntry {
  heading: string
  summary: string
  commits: ReleaseCommit[]
  pullRequests: number[]
  issues: number[]
  authors: string[]
  raw: string
}

function normalizeMarkdownEntry(item: { heading: string, summary: string }): NormalizedMarkdownEntry {
  const raw = item.summary.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
  const commitMatches = [...raw.matchAll(/\[{1,2}`?([0-9a-f]{7,40})`?\]\(([^)]+\/commit\/[^)]+)\)/gi)]
  const pullRequests = [...raw.matchAll(/\[#(\d+)\]\(([^)]+\/pull\/\d+)\)/gi)].map(match => Number(match[1]))
  const issues = [...raw.matchAll(/\[#(\d+)\]\(([^)]+\/issues\/\d+)\)/gi)].map(match => Number(match[1]))
  const authors = [...raw.matchAll(/\bby\s+(@[\w-]+(?:\[bot\])?)/gi)].map(match => match[1] as string)
  const arrowDependency = raw.match(/→\s*`([^`]+)`/)?.[1]
  const dependencyVersions = [...raw.matchAll(/(?:^|\s)((?:@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+(?:-[\w.-]+)?)/g)].map(match => match[1] as string)
  const dependencyLabel = /\bdependenc(?:y|ies):/i.test(raw)
    ? raw.replace(/^.*?\bdependenc(?:y|ies):/i, '').trim().replace(/^[-*]\s*/, '').replace(/^`|`$/g, '')
    : undefined
  const dependencyName = arrowDependency ?? (dependencyVersions.length ? [...new Set(dependencyVersions)].join(', ') : dependencyLabel)
  const hasDependencyHeading = /\bupdated\s+dependenc(?:y|ies)\b|Dependencies:|Dependency:|\*\*Dependencies\*\*|\*\*Dependency\*\*/i.test(raw)
  const hasDependency = hasDependencyHeading || Boolean(dependencyName)
  const summary = hasDependency && dependencyName
    ? dependencyVersions.length > 1
      ? `Updated dependencies: ${[...new Set(dependencyVersions)].join(', ')}.`
      : `Updated dependency to ${dependencyName}.`
    : raw
        .replace(/\[{1,2}`?([0-9a-f]{7,40})`?\]\([^)]+\)/gi, '')
        .replace(/\[#\d+\]\([^)]+\)/g, '')
        .replace(/\bby\s+@[\w-]+(?:\[bot\])?/gi, '')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/^[-*]\s+/, '')
        .replace(/^[^\p{L}\p{N}]+/u, '')
        .replace(/\s+/g, ' ')
        .trim()
  const categoryHint = /🚨|breaking/i.test(raw)
    ? '🚨'
    : /🚀|✨/.test(raw)
      ? '🚀'
      : /🐛|🐞/.test(raw)
        ? '🐞'
        : hasDependency
          ? 'Dependencies'
          : ''
  const commits = commitMatches.map(match => ({
    sha: match[2]?.match(/\/commit\/([0-9a-f]{7,40})/i)?.[1] ?? match[1] as string,
    subject: `${hasDependency ? 'chore' : categoryHint === '🐞' ? 'fix' : categoryHint === '🚀' ? 'feat' : 'chore'}: ${summary}`,
    ...(authors[0] ? { author: authors[0] } : {}),
    summary,
  }))
  return {
    heading: categoryHint ? `${item.heading} ${categoryHint}` : item.heading,
    summary,
    commits,
    pullRequests: [...new Set(pullRequests)],
    issues: [...new Set(issues)],
    authors: uniqueContributors(authors),
    raw,
  }
}

function commitsForPackage(commits: ReleaseCommit[], packageName: string) {
  return uniqueCommits(commits.filter(commit => !commit.packages?.length || commit.packages.includes(packageName)))
}

function normalizeForMatch(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

function commitsForEntry(commits: ReleaseCommit[], summary: string) {
  const normalizedSummary = normalizeForMatch(summary)
  const matched = commits.filter((commit) => {
    const summaries = [commit.summary, ...(commit.summaries ?? [])].filter((value): value is string => Boolean(value))
    if (!summaries.length) {
      return false
    }
    return summaries.some((summary) => {
      const normalizedIntent = normalizeForMatch(summary)
      return normalizedIntent === normalizedSummary
        || normalizedSummary.includes(normalizedIntent)
        || normalizedIntent.includes(normalizedSummary)
    })
  })
  if (matched.length) {
    return matched
  }
  return commits.length === 1 ? commits : []
}

export function buildEntries(release: PackageReleaseSource, commits: ReleaseCommit[]) {
  const packageCommits = commitsForPackage(commits, release.name)
  return readMarkdownEntries(release.content).flatMap((item): ReleaseNoteEntry[] => {
    const normalized = normalizeMarkdownEntry(item)
    const summary = normalized.summary
    if (!summary) {
      return []
    }
    const entryCommits = uniqueCommits([...commitsForEntry(packageCommits, summary), ...normalized.commits])
    const refs = parseReferences(entryCommits, [normalized.raw, summary].join('\n'))
    return [{
      packageName: release.name,
      version: release.version,
      ...(release.npmUrl ? { npmUrl: release.npmUrl } : {}),
      category: classifyChange(normalized.heading, summary, entryCommits),
      summary,
      commits: entryCommits,
      pullRequests: [...new Set([...refs.pullRequests, ...normalized.pullRequests])].sort((a, b) => a - b),
      issues: [...new Set([...refs.issues, ...normalized.issues])].sort((a, b) => a - b),
      authors: uniqueContributors([...normalized.authors, ...entryCommits.map(commit => commit.author).filter((author): author is string => Boolean(author))]),
    }]
  })
}
