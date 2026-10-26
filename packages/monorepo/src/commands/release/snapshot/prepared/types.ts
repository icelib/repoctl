import type { SnapshotOptions } from '../types'

/** GitHub facts frozen by the trusted preparation job, before candidate execution. */
export interface SnapshotSource {
  repository: string
  repositoryId: number
  pullRequest: number
  headSha: string
  baseSha: string
  baseRef: string
  mergeSha: string
  runId: number
  runAttempt: number
  workflowId: number
  workflowPath: string
  workflowSha: string
  defaultBranch: string
}

export interface SnapshotDependency {
  field: 'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies'
  alias: string
  name: string
  version: string
}

export interface SnapshotBuildPackage {
  name: string
  directory: string
  currentVersion: string
  version: string
  reasons: string[]
  dependencies: SnapshotDependency[]
}

export interface SnapshotBuildPlan {
  schemaVersion: 1
  source: SnapshotSource
  identity: { kind: 'pr', pullRequest: number, commit: string, buildId: string }
  identityKey: string
  tag: string
  registry: 'https://registry.npmjs.org/'
  packageManager: string
  packages: SnapshotBuildPackage[]
}

export interface PreparedSnapshotManifest {
  schemaVersion: 1
  plan: SnapshotBuildPlan
  planDigest: string
  packages: Array<{ name: string, version: string, tarball: string, integrity: string }>
  checks: { build: 'passed', packages: Array<{ name: string, status: 'passed', files: string[] }> }
}

export interface SnapshotBuildPlanOptions extends Pick<SnapshotOptions, 'cwd' | 'env' | 'spawn'> {
  source: SnapshotSource
}

export interface PrepareSnapshotOptions extends Pick<SnapshotOptions, 'cwd' | 'env' | 'spawn'> {
  plan: SnapshotBuildPlan
  /** Artifact parent outside the candidate source checkout. */
  outputDirectory: string
}

export interface PreparedSnapshot {
  manifest: PreparedSnapshotManifest
  /** Portable bundle containing only snapshot-manifest.json and declared tarballs. */
  directory: string
}
