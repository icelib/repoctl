import type { ReleaseLifecycleState, ReleaseStateSnapshot } from '../lifecycle/types'
import type { ReleaseNoteDocument } from '../notes/model'

export interface GitHubPullRequest {
  number: number
  html_url: string
  state: string
  title?: string
  body?: string | null
  merged_at?: string | null
  head?: { ref?: string }
}

export interface GitHubRelease {
  id: number
  html_url: string
  tag_name: string
  target_commitish?: string
  name?: string
  body?: string | null
  draft?: boolean
  prerelease?: boolean
}

export interface GitHubCommit {
  author?: { login?: string } | null
  commit?: { author?: { name?: string } | null }
}

export interface GitHubIssue {
  user?: { login?: string } | null
}

export interface GitHubClientOptions {
  token?: string
  repository?: string
  apiUrl?: string
  fetch?: typeof fetch
  retryAttempts?: number
  retryDelay?: number
  sleep?: (milliseconds: number) => Promise<void>
}

export interface EnsurePullRequestOptions {
  head: string
  base: string
  title: string
  body: string
}

export interface CloseLegacyPullRequestsOptions {
  head: string
  base: string
}

export interface EnsureReleaseOptions {
  tag: string
  target: string
  prerelease?: boolean
  name?: string
  body?: string
}

export interface EnsureTagOptions {
  tag: string
  target: string
}

export interface UpdateReleaseOptions {
  id: number
  name: string
  body: string
}

export type GitHubRequest = <T>(method: string, endpoint: string, body?: unknown) => Promise<{ status: number, data: T | undefined }>

export interface GitHubOperations {
  /** 读取跨 runner 的发布阶段记录；查询失败必须抛出。 */
  readReleaseState?: (key: string) => Promise<ReleaseStateSnapshot | undefined>
  /** 以远端 revision 比较并交换，阻止并发覆盖。 */
  writeReleaseState?: (key: string, state: ReleaseLifecycleState, revision?: string) => Promise<string>
  ensurePullRequest: (options: EnsurePullRequestOptions) => Promise<GitHubPullRequest>
  closeLegacyReleasePullRequests?: (options: CloseLegacyPullRequestsOptions) => Promise<void>
  ensureRelease: (options: EnsureReleaseOptions) => Promise<GitHubRelease>
  readTagTarget?: (tag: string) => Promise<string | undefined>
  ensureTag?: (options: EnsureTagOptions) => Promise<void>
  enrichReleaseNote?: (document: ReleaseNoteDocument) => Promise<ReleaseNoteDocument>
  readReleasePullRequestContributors?: (target: string) => Promise<string[]>
  listReleases?: () => Promise<GitHubRelease[]>
  updateRelease?: (options: UpdateReleaseOptions) => Promise<GitHubRelease>
}
