import type { UpgradeLockOwner } from './model'
import { lstat, readFile, realpath } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { UpgradeLockError, upgradeLockMetadataFile, upgradeLockSchemaVersion } from './model'

export function isProcessAlive(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function isValidOwner(value: unknown): value is UpgradeLockOwner {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const owner = value as Partial<UpgradeLockOwner>
  return owner.schemaVersion === upgradeLockSchemaVersion
    && typeof owner.id === 'string'
    && owner.id.length > 0
    && !owner.id.includes('/')
    && !owner.id.includes('\\')
    && typeof owner.pid === 'number'
    && Number.isSafeInteger(owner.pid)
    && owner.pid > 0
    && typeof owner.targetDir === 'string'
    && owner.targetDir.length > 0
    && Number.isFinite(owner.createdAt)
}

/** Resolve aliases such as macOS /var and /private/var consistently. */
export async function normalizeUpgradeTargetDir(targetDir: string) {
  const resolved = path.resolve(targetDir)
  try {
    return path.resolve(await realpath(resolved))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return resolved
    }
    throw error
  }
}

export async function readOwner(lockPath: string, targetDir: string): Promise<UpgradeLockOwner | undefined> {
  const ownerPath = path.join(lockPath, upgradeLockMetadataFile)
  try {
    const info = await lstat(ownerPath)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new UpgradeLockError('ERR_REPOCTL_UPGRADE_LOCK_MALFORMED', `Upgrade lock metadata must be a regular file: ${ownerPath}`, lockPath)
    }
    const value: unknown = JSON.parse(await readFile(ownerPath, 'utf8'))
    if (!isValidOwner(value) || await normalizeUpgradeTargetDir(value.targetDir) !== await normalizeUpgradeTargetDir(targetDir)) {
      throw new UpgradeLockError('ERR_REPOCTL_UPGRADE_LOCK_MALFORMED', `Upgrade lock metadata is invalid: ${ownerPath}`, lockPath)
    }
    return value
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    if (error instanceof UpgradeLockError) {
      throw error
    }
    if (error instanceof SyntaxError) {
      throw new UpgradeLockError('ERR_REPOCTL_UPGRADE_LOCK_MALFORMED', `Upgrade lock metadata is invalid: ${ownerPath}`, lockPath)
    }
    throw error
  }
}
