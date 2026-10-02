import type { UpgradeLockOwner, UpgradeTransactionLock } from './model'
import { randomUUID } from 'node:crypto'
import { lstat, rename, rm, rmdir } from 'node:fs/promises'
import path from 'pathe'
import { hasSameLockIdentity } from './identity'
import { UpgradeLockError } from './model'
import { readOwner } from './owner'
import { isRenameConflict } from './pending'

export async function releaseUpgradeLock(lock: UpgradeTransactionLock): Promise<void> {
  if (lock.released) {
    return
  }
  let owner: UpgradeLockOwner | undefined
  try {
    owner = await readOwner(lock.path, path.dirname(path.dirname(lock.path)))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      lock.released = true
      return
    }
    throw error
  }
  if (!owner || owner.id !== lock.id) {
    throw new UpgradeLockError('ERR_REPOCTL_UPGRADE_LOCK_MALFORMED', `Upgrade lock ownership changed: ${lock.path}`, lock.path, owner)
  }

  // Remove through a private tombstone so a replacement at the visible lock
  // path can never be mistaken for this process's lock. The owner file and
  // directory identity are checked again after the rename before recursive
  // cleanup, matching stale-lock takeover's ownership boundary.
  let lockInfo
  try {
    lockInfo = await lstat(lock.path)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      lock.released = true
      return
    }
    throw error
  }
  if (!lockInfo.isDirectory() || lockInfo.isSymbolicLink()) {
    throw new UpgradeLockError('ERR_REPOCTL_UPGRADE_LOCK_MALFORMED', `Upgrade lock ownership changed: ${lock.path}`, lock.path, owner)
  }
  const latestOwner = await readOwner(lock.path, path.dirname(path.dirname(lock.path)))
  if (!latestOwner || latestOwner.id !== lock.id || !hasSameLockIdentity(lockInfo, await lstat(lock.path))) {
    throw new UpgradeLockError('ERR_REPOCTL_UPGRADE_LOCK_MALFORMED', `Upgrade lock ownership changed: ${lock.path}`, lock.path, latestOwner)
  }

  const tombstone = `${lock.path}.${randomUUID()}.releasing`
  try {
    await rename(lock.path, tombstone)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new UpgradeLockError('ERR_REPOCTL_UPGRADE_LOCK_MALFORMED', `Upgrade lock disappeared during release: ${lock.path}`, lock.path, owner)
    }
    throw error
  }
  let movedInfo
  try {
    movedInfo = await lstat(tombstone)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new UpgradeLockError('ERR_REPOCTL_UPGRADE_LOCK_MALFORMED', `Upgrade lock disappeared during release: ${lock.path}`, lock.path, owner)
    }
    throw error
  }
  let movedOwner: UpgradeLockOwner | undefined
  let movedOwnerError: unknown
  try {
    movedOwner = await readOwner(tombstone, path.dirname(path.dirname(lock.path)))
  }
  catch (error) {
    movedOwnerError = error
  }
  if (!movedInfo.isDirectory() || movedInfo.isSymbolicLink() || !hasSameLockIdentity(movedInfo, lockInfo) || !movedOwner || movedOwner.id !== lock.id) {
    try {
      await rename(tombstone, lock.path)
    }
    catch (error) {
      if (!isRenameConflict(error)) {
        throw error
      }
    }
    if (movedOwnerError instanceof UpgradeLockError) {
      throw movedOwnerError
    }
    throw new UpgradeLockError('ERR_REPOCTL_UPGRADE_LOCK_MALFORMED', `Upgrade lock ownership changed: ${lock.path}`, lock.path, movedOwner)
  }
  await rm(tombstone, { recursive: true, force: false })
  if (lock.cleanupParent) {
    await rmdir(lock.cleanupParent).catch((error: NodeJS.ErrnoException) => {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code ?? '')) {
        throw error
      }
    })
  }
  lock.released = true
}
