import type { Buffer } from 'node:buffer'
import type { CliOpts } from '../../types'

export type UpgradeAction = 'create' | 'update' | 'delete' | 'skip'

export interface UpgradeDiff {
  kind: 'text' | 'binary'
  beforeBytes: number
  afterBytes: number
  beforeHash: string | null
  afterHash: string | null
  addedLines: number
  deletedLines: number
  truncated: boolean
  /** Bounded unified text, present only when explicitly requested. */
  text?: string
}

export interface UpgradePlanFile {
  /** Path relative to targetDir. */
  path: string
  action: UpgradeAction
  reason: string
  requiresConfirmation: boolean
  /** All dependencies must be accepted before this change can run. */
  dependsOn: string[]
  /** Content summary for changed files; omitted for identical/skipped files. */
  diff?: UpgradeDiff
}

export interface UpgradePlan {
  cwd: string
  targetDir: string
  files: UpgradePlanFile[]
}

export interface UpgradeOperation {
  file: UpgradePlanFile
  targetPath: string
  before: Buffer | undefined
  after: Buffer | undefined
  mode?: number
  /** Filesystem identity captured before and after a managed mutation. */
  beforeIdentity?: UpgradeFileIdentity
  afterIdentity?: UpgradeFileIdentity
}

export interface UpgradeFileIdentity {
  dev: number
  ino: number
}

export interface PreparedUpgrade {
  plan: UpgradePlan
  operations: UpgradeOperation[]
  options: CliOpts
}
