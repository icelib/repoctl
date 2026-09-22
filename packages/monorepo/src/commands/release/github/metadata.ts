import type { ReleaseNoteDocument } from '../notes/model'
import type { GitHubCommit, GitHubIssue, GitHubPullRequest, GitHubRequest } from './types'
import { uniqueContributors } from '../notes/model'

function parseReleasePullRequestContributors(body: string | null | undefined) {
  if (!body) {
    return []
  }
  const contributors = body.match(/(?:Thanks to|感谢)\s+([^\n]+)/i)?.[1]
  return contributors ? uniqueContributors(contributors.split(/\s+·\s+/)) : []
}
function isReleasePullRequest(pullRequest: GitHubPullRequest) {
  return pullRequest.title?.startsWith('chore(release):') === true
    || pullRequest.body?.includes('# Release Notes') === true
    || pullRequest.body?.includes('# 发布说明') === true
}

export async function readReleasePullRequestContributors(request: GitHubRequest, target: string) {
  try {
    const response = await request<GitHubPullRequest[]>('GET', `/commits/${encodeURIComponent(target)}/pulls`)
    const releasePullRequest = (response.data ?? []).find(isReleasePullRequest)
    return parseReleasePullRequestContributors(releasePullRequest?.body)
  }
  catch {
    return []
  }
}

export async function enrichReleaseNote(request: GitHubRequest, document: ReleaseNoteDocument) {
  const commitAuthors = new Map<string, string>()
  const commitShas = [...new Set(document.entries.flatMap(entry => entry.commits.map(commit => commit.sha)))]
  for (const sha of commitShas) {
    try {
      const response = await request<GitHubCommit>('GET', `/commits/${encodeURIComponent(sha)}`)
      const author = response.data?.author?.login
      if (author) {
        commitAuthors.set(sha, author)
      }
    }
    catch {
      // Missing commit metadata must not block release publication.
    }
  }

  const referenceAuthors = new Map<number, string>()
  const referenceNumbers = [...new Set(document.entries.flatMap(entry => [...entry.pullRequests, ...entry.issues]))]
  for (const number of referenceNumbers) {
    try {
      const response = await request<GitHubIssue>('GET', `/issues/${number}`)
      const author = response.data?.user?.login
      if (author) {
        referenceAuthors.set(number, author)
      }
    }
    catch {
      // Missing issue or pull request metadata must not block release publication.
    }
  }

  const entries = document.entries.map((entry) => {
    const authors = uniqueContributors([
      ...entry.authors,
      ...entry.commits.map(commit => commitAuthors.get(commit.sha)).filter((author): author is string => Boolean(author)),
      ...entry.pullRequests.map(number => referenceAuthors.get(number)).filter((author): author is string => Boolean(author)),
      ...entry.issues.map(number => referenceAuthors.get(number)).filter((author): author is string => Boolean(author)),
    ])
    return authors.length ? { ...entry, authors } : entry
  })
  return {
    ...document,
    entries,
    contributors: uniqueContributors([
      ...document.contributors,
      ...entries.flatMap(entry => entry.authors),
    ]),
  }
}
