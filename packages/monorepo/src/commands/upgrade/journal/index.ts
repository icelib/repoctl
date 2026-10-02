export { assertNoPendingUpgradeTransactions, inspectUpgradeTransactions } from './inspect'
export { acquireUpgradeLock, inspectUpgradeLock, releaseUpgradeLock, upgradeLockDirectory, UpgradeLockError, upgradeLockMetadataFile } from './lock'
export type { UpgradeLockErrorCode, UpgradeLockInspection, UpgradeLockInspectionState, UpgradeLockOwner, UpgradeTransactionLock } from './lock'
export { relativeUpgradeOperationPath } from './shared'
export {
  beginUpgradeTransaction,
  completeUpgradeTransaction,
  discardUpgradeTransaction,
  markUpgradeOperationApplied,
  markUpgradeTransactionNeedsReview,
} from './transaction'
export { upgradeJournalSchemaVersion, upgradeTransactionDirectory } from './types'
export type {
  UpgradeJournalOperation,
  UpgradeTransactionHandle,
  UpgradeTransactionInspection,
  UpgradeTransactionJournal,
  UpgradeTransactionState,
} from './types'
