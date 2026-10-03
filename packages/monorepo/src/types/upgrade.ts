import type { CliOpts } from './cli'

export interface UpgradeOptions extends CliOpts {
  /** Return a complete plan without preparing assets, prompting or writing files. */
  dryRun?: boolean
  /** Override the configured asset selection with exact files or directory prefixes. */
  targets?: string[]
  /** Whether configured targets extend the default asset selection. */
  mergeTargets?: boolean
  /** Attest an exact previous template version when no migration history exists. */
  fromVersion?: string
}

export type UpgradeFileStatus = 'add' | 'modify' | 'delete' | 'identical' | 'skip' | 'conflict'

/** A reviewed, transactional change to one root asset's upstream baseline. */
export interface UpgradeBaselineChange {
  path: string
  beforeHash: string | null
  afterHash: string | null
  content: string | null
}

export interface UpgradeMergeDetails {
  baseHash: string | null
  localHash: string | null
  upstreamHash: string | null
  conflicts: { baseStart: number, baseEnd: number, base: string, local: string, upstream: string }[]
}

export interface UpgradeFilePlan {
  path: string
  status: UpgradeFileStatus
  /** Stable machine-readable explanation. */
  reason: string
  detail: string
  beforeHash: string | null
  afterHash: string | null
  /** Exact planned bytes in base64; null means deletion or no write. */
  content: string | null
  binary: boolean
  diff: string | null
  /** Files in a group must be applied together. */
  group: string | null
  /** The legacy interactive command can approve these changes without a prompt. */
  automatic: boolean
  /** Present only when this reviewed selection also changes its baseline. */
  baseline?: UpgradeBaselineChange
  merge?: UpgradeMergeDetails
}

export interface UpgradeInput {
  area: 'target' | 'asset' | 'config'
  path: string
  hash: string | null
}

export interface UpgradeMigrationStep {
  id: string
  version: string
  status: 'pending' | 'completed' | 'failed' | 'skipped' | 'blocked'
  reason: string
  files: string[]
}

export interface UpgradeMigrationsPlan {
  fromVersion: string | null
  toVersion: string
  steps: UpgradeMigrationStep[]
  /** Recovery explicitly distinguishes files already written before interruption. */
  recovery: { path: string, state: 'before' | 'after' }[]
  /** Reviewed intermediate states; completed content is a normal plan file. */
  ledger?: { path: string, pending: string, failed: string }
}

export interface UpgradePlan {
  schemaVersion: 1
  cwd: string
  rootDir: string
  assetDir: string
  status: 'ready' | 'blocked'
  targets: string[]
  discovery: { patterns: string[] | null, manifests: string[] } | null
  inputs: UpgradeInput[]
  files: UpgradeFilePlan[]
  blockers: { id: string, path: string | null, detail: string }[]
  migrations?: UpgradeMigrationsPlan
}

export interface UpgradeApplyOptions {
  /** Apply only these reviewed paths; omitted means every actionable plan entry. */
  files?: string[]
}

export interface UpgradeApplyResult {
  status: 'applied' | 'unchanged'
  changed: string[]
  /** Unresolved files are never written or recorded as successfully upgraded. */
  conflicts?: string[]
}
