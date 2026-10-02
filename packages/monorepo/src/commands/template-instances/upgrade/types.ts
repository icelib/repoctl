import type { TemplateInstance, TemplateInstanceSource, TemplateSnapshotFile } from '@icebreakers/monorepo-templates'
import type { TextMergeConflict } from '../../../core/merge-text'

export interface TemplateUpgradeOptions {
  cwd: string
  instance: string
  version: string
  sourceDir?: string
  /** Workspace-instance-relative files or directories that must remain unmanaged. */
  exclude?: string[]
}

export type TemplateUpgradeEntry = { kind: 'directory' } | ({ kind: 'file' } & Omit<TemplateSnapshotFile, 'path'>)

export interface TemplateUpgradeChange {
  path: string
  status: 'add' | 'modify' | 'delete' | 'unchanged' | 'preserved' | 'conflict'
  reason: string
  before: TemplateUpgradeEntry | null
  after: TemplateUpgradeEntry | null
  conflicts?: TextMergeConflict[]
}

export interface TemplateUpgradePlan {
  schemaVersion: 1
  options: TemplateUpgradeOptions
  instanceId: string
  target: string
  source: TemplateInstanceSource
  action: 'upgrade' | 'unchanged' | 'conflict'
  changes: TemplateUpgradeChange[]
  registryDigest: string
  targetDigest: string
  nextInstance: TemplateInstance
  fingerprint: string
}

export interface TemplateUpgradeResult {
  schemaVersion: 1
  instanceId: string
  target: string
  status: 'applied' | 'unchanged'
  changed: string[]
}

export interface TemplateUpgradeRecoveryResult {
  schemaVersion: 1
  instanceId: string
  status: 'no-pending-upgrade' | 'recoverable' | 'conflict' | 'recovered'
  registryStatus?: 'before' | 'after' | 'conflict'
  applied: boolean
  files: { path: string, state: 'before' | 'after' | 'conflict' }[]
  recoveryPath?: string
}
