import type { ReleaseNoteEntry, ReleaseNoteGroup } from './model'
import { uniqueCommits, uniqueContributors } from './model'

function normalizeSummary(summary: string) {
  return summary
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function sourceReferences(group: Pick<ReleaseNoteGroup, 'commits' | 'pullRequests' | 'issues'>) {
  return new Set([
    ...group.commits.map(commit => `commit:${commit.sha}`),
    ...group.pullRequests.map(number => `pull:${number}`),
    ...group.issues.map(number => `issue:${number}`),
  ])
}

function referencesCanMerge(group: ReleaseNoteGroup, entry: ReleaseNoteEntry) {
  const groupReferences = sourceReferences(group)
  const entryReferences = sourceReferences(entry)
  if (!groupReferences.size && !entryReferences.size) {
    return true
  }
  if (!groupReferences.size || !entryReferences.size) {
    return false
  }
  return [...entryReferences].some(reference => groupReferences.has(reference))
}

function addEntry(group: ReleaseNoteGroup, entry: ReleaseNoteEntry) {
  group.entries.push(entry)
  group.packageNames = [...new Set([...group.packageNames, entry.packageName])]
  group.commits = uniqueCommits([...group.commits, ...entry.commits])
  group.pullRequests = [...new Set([...group.pullRequests, ...entry.pullRequests])].sort((a, b) => a - b)
  group.issues = [...new Set([...group.issues, ...entry.issues])].sort((a, b) => a - b)
  group.authors = uniqueContributors([...group.authors, ...entry.authors])
}

export function groupReleaseNoteEntries(entries: ReleaseNoteEntry[]): ReleaseNoteGroup[] {
  const groups: ReleaseNoteGroup[] = []
  for (const entry of entries) {
    const normalizedSummary = normalizeSummary(entry.summary)
    const group = groups.find((candidate) => {
      return candidate.category === entry.category
        && normalizeSummary(candidate.summary) === normalizedSummary
        && referencesCanMerge(candidate, entry)
    })
    if (group) {
      addEntry(group, entry)
      continue
    }
    groups.push({
      category: entry.category,
      summary: entry.summary,
      entries: [entry],
      packageNames: [entry.packageName],
      commits: uniqueCommits([...entry.commits]),
      pullRequests: [...entry.pullRequests],
      issues: [...entry.issues],
      authors: uniqueContributors([...entry.authors]),
    })
  }
  return groups
}
