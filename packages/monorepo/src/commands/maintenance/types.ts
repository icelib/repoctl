import type { spawnSync } from 'node:child_process'
import type { UpgradePlan } from '../../types/upgrade'

export interface MaintenanceUpgradeOptions {
  cwd: string
  base: string
  head?: string
  /** An empty directory outside the checkout; reports survive validation failure. */
  outputDirectory: string
  env?: NodeJS.ProcessEnv
  /** Test seam for package-manager validation; Git reads always use the real checkout. */
  spawn?: typeof spawnSync
}

export interface MaintenanceVersionChange {
  status: 'changed' | 'unchanged' | 'blocked'
  from: string | null
  to: string | null
  reason: string
}

export interface MaintenanceFile {
  path: string
  beforeHash: string | null
  afterHash: string | null
  beforeMode: string | null
  afterMode: string | null
}

export interface MaintenanceUpgradeReport {
  schemaVersion: 1
  kind: 'repoctl-maintenance-upgrade'
  status: 'ready' | 'unchanged' | 'blocked'
  base: string
  head: string
  repository: string | null
  runId: string | null
  runAttempt: string | null
  branch: 'repoctl/managed-assets'
  versions: MaintenanceVersionChange
  plan: UpgradePlan | null
  checks: { name: string, args: string[], status: 'passed' | 'failed' | 'skipped', log: string }[]
  files: MaintenanceFile[]
  patchHash: string | null
  errors: string[]
}
