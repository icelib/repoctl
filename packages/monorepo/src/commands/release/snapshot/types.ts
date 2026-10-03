import type { PackageCheckResult } from '../../package-check/types'
import type { ReleasePlan } from '../plan'
import type { ReleaseOptions } from '../types'

export type SnapshotIdentity = { kind: 'pr', pullRequest: number, commit: string, buildId: string } | { kind: 'nightly', commit: string, buildId: string }

export interface SnapshotOptions extends Pick<ReleaseOptions, 'cwd' | 'env' | 'spawn' | 'sleep'> {
  identity: SnapshotIdentity
  /** Parent of a new isolated directory; must be outside the source repository. */
  outputDirectory?: string
  /** Explicit publication registry; defaults to the public npm registry. */
  registry?: string
  /** Publication additionally requires an explicitly authorized, trusted GitHub Actions job. */
  publish?: boolean
  /** Only inspect candidates and identity; do not install, build, pack or publish. */
  dryRun?: boolean
}

export interface SnapshotPackage {
  name: string
  directory: string
  currentVersion: string
  version: string
  reasons: string[]
  tarball?: string
  integrity?: string
  published?: boolean
}

export interface SnapshotReport {
  schemaVersion: 1
  identity: SnapshotIdentity
  identityKey: string
  source: string
  tag: string
  registry: string
  status: 'planned' | 'prepared' | 'published' | 'failed'
  packages: SnapshotPackage[]
  nativePlan: ReleasePlan
  install: { executable: 'pnpm', args: string[] }
  installCommand: string
  outputDirectory?: string
  checks?: PackageCheckResult[]
  error?: string
}
