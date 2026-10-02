import type { UpgradeFileIdentity } from '../types'
import type { UpgradeTransactionLock } from './lock'

/** The on-disk format is intentionally versioned so future recoverers can be conservative. */
export const upgradeJournalSchemaVersion = 1
export const upgradeTransactionDirectory = '.repoctl/transactions'

export type UpgradeTransactionState = 'applying' | 'completed' | 'needs-review'

export interface UpgradeJournalOperation {
  path: string
  beforeExists: boolean
  afterExists: boolean
  beforeBytes: number
  afterBytes: number
  beforeHash: string | null
  afterHash: string | null
  beforeIdentity?: UpgradeFileIdentity
  afterIdentity?: UpgradeFileIdentity
  mode?: number
  /** Relative to the transaction directory. Present for files with a pre-image. */
  backup?: string
  applied: boolean
}

export interface UpgradeTransactionJournal {
  schemaVersion: typeof upgradeJournalSchemaVersion
  id: string
  pid: number
  targetDir: string
  createdAt: number
  updatedAt: number
  state: UpgradeTransactionState
  operations: UpgradeJournalOperation[]
  error?: string
}

export interface UpgradeTransactionInspection {
  id: string
  path: string
  targetDir: string
  state: UpgradeTransactionState | 'malformed'
  createdAt?: number
  updatedAt?: number
  pid?: number
  operationCount: number
  appliedCount: number
  needsReview: boolean
  error?: string
}

export interface UpgradeTransactionHandle {
  directory: string
  journalPath: string
  journal: UpgradeTransactionJournal
  /** Identity captured before any cleanup so a replaced directory is preserved. */
  directoryIdentity: UpgradeFileIdentity
  /** Parent directories created solely for this transaction. */
  cleanupDirectories: string[]
  lock: UpgradeTransactionLock
}
