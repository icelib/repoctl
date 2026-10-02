export { acquireUpgradeLock } from './lock/acquire'
export { inspectUpgradeLock } from './lock/inspect'
export {
  upgradeLockDirectory,
  UpgradeLockError,
  upgradeLockMetadataFile,
} from './lock/model'
export type {
  UpgradeLockErrorCode,
  UpgradeLockInspection,
  UpgradeLockInspectionState,
  UpgradeLockOwner,
  UpgradeTransactionLock,
} from './lock/model'
export { isProcessAlive, normalizeUpgradeTargetDir, readOwner } from './lock/owner'
export { releaseUpgradeLock } from './lock/release'
