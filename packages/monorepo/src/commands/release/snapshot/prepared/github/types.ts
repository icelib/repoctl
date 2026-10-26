import type { PreparedSnapshotManifest, SnapshotBuildPlan, SnapshotSource } from '../types'

export interface SnapshotGitHubOptions {
  repository: string
  /** Defaults to GITHUB_TOKEN; never forwarded to artifact storage redirects. */
  token?: string
  fetch?: typeof globalThis.fetch
}

export interface SnapshotWorkflowPolicy {
  workflowPath: string
  /** SHA256 of the exact trusted builder workflow bytes, with optional sha256: prefix. */
  workflowSha256: string
  environment: string
  freezeJobName?: string
  buildJobName?: string
}

export interface VerifySnapshotRunOptions extends SnapshotGitHubOptions {
  runId: number
  runAttempt: number
  artifactId?: number
  policy: SnapshotWorkflowPolicy
}

export interface FreezeSnapshotSourceOptions extends SnapshotGitHubOptions {
  pullRequest: number
  runId: number
  runAttempt: number
  workflowPath: string
}

export interface SnapshotArtifactEvidence {
  id: number
  digest: string
}

export interface SnapshotFreezeRecord {
  schemaVersion: 1
  source: SnapshotSource
  planDigest: string
  artifact: SnapshotArtifactEvidence
}

export interface SnapshotRunEvidence {
  source: SnapshotSource
  freezeJobId: number
  buildJobId: number
  planArtifact: SnapshotArtifactEvidence
  buildArtifact: SnapshotArtifactEvidence
  planDigest: string
}

export interface VerifiedSnapshotRun {
  plan: SnapshotBuildPlan
  manifest: PreparedSnapshotManifest
  files: Map<string, Uint8Array>
  evidence: SnapshotRunEvidence
  /** Recheck the run attempt, live PR refs and merge parents before publication. */
  assertCurrent: () => Promise<void>
}

export type GitHubRecord = Record<string, unknown>
