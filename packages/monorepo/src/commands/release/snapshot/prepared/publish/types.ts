import type { ReleaseOptions } from '../../../types'
import type { SnapshotRunEvidence, VerifySnapshotRunOptions } from '../github/types'
import type { PreparedSnapshotManifest } from '../types'

export interface PreparedSnapshotPublishOptions extends VerifySnapshotRunOptions, Pick<ReleaseOptions, 'env' | 'spawn' | 'sleep' | 'registryFetch'> {
  outputDirectory: string
  /** Exact trusted publisher filename; defaults to the exported official recipe. */
  publisherWorkflowPath?: string
}

export interface PreparedSnapshotPublishReport {
  schemaVersion: 1
  status: 'published' | 'failed'
  manifest: PreparedSnapshotManifest
  evidence: SnapshotRunEvidence
  packages: Array<{ name: string, version: string, integrity: string, published: boolean }>
  install: { executable: 'pnpm', args: string[] }
  installCommand: string
  outputDirectory: string
  error?: string
}
