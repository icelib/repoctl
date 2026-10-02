import process from 'node:process'

export const upgradeLockDirectory = '.repoctl/upgrade.lock'
export const upgradeLockMetadataFile = 'owner.json'
export const upgradeLockSchemaVersion = 1

export type UpgradeLockErrorCode = 'ERR_REPOCTL_UPGRADE_LOCKED' | 'ERR_REPOCTL_UPGRADE_LOCK_MALFORMED'

export interface UpgradeLockOwner {
  schemaVersion: typeof upgradeLockSchemaVersion
  id: string
  pid: number
  targetDir: string
  createdAt: number
}

export interface UpgradeTransactionLock {
  path: string
  id: string
  released: boolean
  cleanupParent: string | undefined
}

/** Read-only state of the workspace upgrade lock. */
export type UpgradeLockInspectionState = 'missing' | 'active' | 'stale' | 'malformed'

export interface UpgradeLockInspection {
  path: string
  targetDir: string
  state: UpgradeLockInspectionState
  owner?: UpgradeLockOwner
  reason?: string
}

export class UpgradeLockError extends Error {
  readonly code: UpgradeLockErrorCode
  readonly lockPath: string
  readonly owner: UpgradeLockOwner | undefined
  readonly sameProcess: boolean

  constructor(code: UpgradeLockErrorCode, message: string, lockPath: string, owner?: UpgradeLockOwner) {
    super(message)
    this.name = 'UpgradeLockError'
    this.code = code
    this.lockPath = lockPath
    this.owner = owner
    this.sameProcess = owner?.pid === process.pid
  }
}
