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
  /** Read-only provider and optional public readiness HTTP transport; credentials are never persisted. */
  fetch?: typeof fetch
  /** Stream child stdout to stderr so CLI JSON stdout contains only the result/report. */
  json?: boolean
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
  report?: DocsDeploymentReport
}

export interface DocsProviderReceipt {
  versionId: string
  url?: string
}

export type DocsDeploymentStageKey = 'plan' | 'preflight' | 'install' | 'build' | 'provider' | 'readiness' | 'finalize'

export interface DocsDeploymentStage {
  stage: DocsDeploymentStageKey
  status: 'completed' | 'skipped' | 'failed'
  elapsedMs: number
  reason?: string
  /** Fixed repoctl-owned guidance; never a caught exception or provider response body. */
  message?: string
  operation?: 'upload' | 'reconcile'
}

export interface DocsDeploymentReport {
  schemaVersion: 1
  site: string
  channel: DocsChannel
  startedAt: string
  elapsedMs: number
  status: 'deployed' | 'skipped' | 'failed'
  stages: DocsDeploymentStage[]
  failedStage?: DocsDeploymentStageKey
  resumablePhase?: 'deploying' | 'verifying'
  deploymentId?: string
  versionId?: string
  /** Reporting failures do not change the deployment outcome or hide its primary error. */
  warnings?: Array<'summary-write-failed'>
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
    phase: 'building' | 'deploying' | 'verifying'
    /** Required while verifying; reused without rebuilding or uploading on retry. */
    receipt?: DocsProviderReceipt
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
