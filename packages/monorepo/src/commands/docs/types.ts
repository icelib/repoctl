import type { spawnSync } from 'node:child_process'
import type { DocsChannel, DocsCommandConfig, DocsSiteConfig } from '../../types/docs'
import type { ReleaseCompletionRecord } from '../release/completion/types'
import type { GitHubOperations } from '../release/github'

export type DocsStateStore = Required<Pick<GitHubOperations, 'readAutomationState' | 'writeAutomationState' | 'readBranchHead'>>

export interface DocsOptions {
  cwd: string
  site: string
  channel: DocsChannel
  /** Full source SHA; preview only. */
  sourceSha?: string
  /** Stable completion ID. Omit for the current baseline, or its pending first deployment when no current baseline exists. */
  release?: string
  /** Selected, single-parent commits already merged into origin/main. */
  commits?: string[]
  config?: DocsCommandConfig
  env?: NodeJS.ProcessEnv
  github?: DocsStateStore
  /** Script process transport. Git operations always use the actual repository. */
  spawn?: typeof spawnSync
}

export interface DocsDeploymentPlan {
  schemaVersion: 1
  repository: string
  site: string
  channel: DocsChannel
  sourceSha: string
  releaseId?: string
  packages: ReleaseCompletionRecord['packages']
  commits: string[]
  treeSha: string
  deploymentId: string
  baseRevision?: string
  eligible: boolean
  skipped: boolean
  blockers: string[]
}

export interface DocsDeploymentResult {
  plan: DocsDeploymentPlan
  status: 'deployed' | 'skipped'
  versionId?: string
  url?: string
}

export interface DocsDeploymentPointer {
  deploymentId: string
  sourceSha: string
  releaseId?: string
  commits: string[]
  treeSha: string
  versionId: string
  url?: string
}

export interface DocsDeploymentState {
  schemaVersion: 1
  repository: string
  site: string
  channel: DocsChannel
  current?: DocsDeploymentPointer
  /** A persisted claim prevents concurrent callers from deploying before their CAS write. */
  pending?: {
    deploymentId: string
    runId: string
    phase: 'building' | 'deploying'
    /** Stable retries use these immutable inputs even when main changes or removes the site. */
    snapshot?: StableDocsSnapshot
  }
}

export interface StableDocsSnapshot {
  releaseId: string
  requestedCommits: string[]
  sourceSha: string
  commits: string[]
  treeSha: string
  config: DocsSiteConfig
}
