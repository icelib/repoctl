import type { UpgradeLockOwner, UpgradeTransactionLock } from './model'
import type { LockDirectoryIdentity } from './pending'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { hasSameLockIdentity } from './identity'
import {
  upgradeLockDirectory,
  UpgradeLockError,
  upgradeLockMetadataFile,
  upgradeLockSchemaVersion,
} from './model'
import { isProcessAlive, normalizeUpgradeTargetDir, readOwner } from './owner'
import { cleanupPendingLock, isRenameConflict } from './pending'

const lockWaitAttempts = 5
const lockWaitIntervalMs = 10

async function assertRealDirectory(target: string, description: string) {
  try {
    const info = await lstat(target)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`${description} must be a real directory: ${target}`)
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

function lockBusyError(lockPath: string, owner?: UpgradeLockOwner) {
  const detail = owner
    ? `pid ${owner.pid}${owner.pid === process.pid ? ' in this process' : ''}`
    : 'an unknown owner'
  return new UpgradeLockError('ERR_REPOCTL_UPGRADE_LOCKED', `Upgrade is already running for this workspace (${detail}); retry after it finishes.`, lockPath, owner)
}

function missingOwnerError(lockPath: string) {
  return new UpgradeLockError('ERR_REPOCTL_UPGRADE_LOCK_MALFORMED', `Upgrade lock metadata is missing: ${lockPath}`, lockPath)
}

async function hasSameOwner(lockPath: string, expected: UpgradeLockOwner) {
  try {
    const owner = await readOwner(lockPath, expected.targetDir)
    return owner?.id === expected.id
      && owner.pid === expected.pid
      && owner.createdAt === expected.createdAt
  }
  catch {
    return false
  }
}

async function takeOverDeadLock(lockPath: string, owner: UpgradeLockOwner, expected: LockDirectoryIdentity) {
  if (isProcessAlive(owner.pid)) {
    throw lockBusyError(lockPath, owner)
  }

  // Rename first so two contenders cannot both remove the same stale lock and
  // then acquire the workspace concurrently. The winner owns the tombstone;
  // losers observe ENOENT and retry acquisition.
  const stalePath = `${lockPath}.${randomUUID()}.stale`
  try {
    await rename(lockPath, stalePath)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }

  // The owner metadata and the directory path can be replaced independently.
  // Verify the directory moved to the tombstone is the one we inspected before
  // removing it. If it is foreign, restore it when possible and retry against
  // the current lock path without deleting unknown contents.
  // Keep the complete stat result here: takeover validation needs the file
  // type as well as the device/inode identity captured before the rename.
  let movedInfo: Awaited<ReturnType<typeof lstat>>
  try {
    movedInfo = await lstat(stalePath)
  }
  catch {
    return false
  }
  if (!movedInfo.isDirectory() || movedInfo.isSymbolicLink() || !hasSameLockIdentity(movedInfo, expected) || !await hasSameOwner(stalePath, owner)) {
    try {
      await rename(stalePath, lockPath)
    }
    catch (error) {
      if (!isRenameConflict(error)) {
        throw error
      }
      // A concurrent owner now occupies lockPath. Leave the tombstone in place
      // for explicit inspection rather than overwriting either side.
    }
    return false
  }
  await rm(stalePath, { recursive: true, force: true })
  return true
}

export async function acquireUpgradeLock(targetDir: string): Promise<UpgradeTransactionLock> {
  const resolvedTargetDir = await normalizeUpgradeTargetDir(targetDir)
  const lockPath = path.join(resolvedTargetDir, upgradeLockDirectory)
  const parent = path.dirname(lockPath)
  let parentExisted = true
  try {
    await lstat(parent)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      parentExisted = false
    }
    else {
      throw error
    }
  }
  await assertRealDirectory(parent, 'Upgrade lock parent')
  await mkdir(parent, { recursive: true })
  await assertRealDirectory(parent, 'Upgrade lock parent')

  for (let attempt = 0; attempt < lockWaitAttempts; attempt++) {
    const owner: UpgradeLockOwner = {
      schemaVersion: upgradeLockSchemaVersion,
      id: randomUUID(),
      pid: process.pid,
      targetDir: resolvedTargetDir,
      createdAt: Date.now(),
    }
    // Prepare metadata outside the visible lock path. Publishing the whole
    // directory with rename makes the claim atomic: a process killed between
    // mkdir and owner.json write can only leave an unreachable pending claim,
    // never an empty lock that blocks every later invocation.
    const pendingPath = `${lockPath}.${owner.id}.pending`
    let pendingInfo: LockDirectoryIdentity | undefined
    let renameConflict = false
    try {
      await mkdir(pendingPath)
      pendingInfo = await lstat(pendingPath)
      await writeFile(path.join(pendingPath, upgradeLockMetadataFile), `${JSON.stringify(owner)}\n`, { encoding: 'utf8', flag: 'wx' })
      // On POSIX, renaming a directory over an existing *empty* directory can
      // succeed. Check the destination first so malformed or legacy locks are
      // never silently replaced; a concurrent creator is still handled by the
      // rename conflict branch below.
      try {
        await lstat(lockPath)
        renameConflict = true
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
        try {
          await rename(pendingPath, lockPath)
        }
        catch (renameError) {
          if (!isRenameConflict(renameError)) {
            throw renameError
          }
          renameConflict = true
        }
      }
    }
    finally {
      await cleanupPendingLock(pendingPath, pendingInfo, upgradeLockMetadataFile).catch(() => {})
    }

    if (!renameConflict) {
      return { path: lockPath, id: owner.id, released: false, cleanupParent: parentExisted ? undefined : parent }
    }

    await assertRealDirectory(lockPath, 'Upgrade lock')
    const existingOwner = await readOwner(lockPath, resolvedTargetDir)
    if (!existingOwner) {
      // A legacy or interrupted implementation can still leave a visible
      // directory before owner.json is written. Preserve that malformed lock
      // for explicit recovery instead of guessing that it is ours.
      if (attempt + 1 < lockWaitAttempts) {
        await new Promise(resolve => setTimeout(resolve, lockWaitIntervalMs))
        continue
      }
      throw missingOwnerError(lockPath)
    }
    let existingInfo: Awaited<ReturnType<typeof lstat>>
    try {
      existingInfo = await lstat(lockPath)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }
      throw error
    }
    if (await takeOverDeadLock(lockPath, existingOwner, existingInfo)) {
      continue
    }
  }
  throw lockBusyError(lockPath)
}
