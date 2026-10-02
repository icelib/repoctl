import type { UpgradeLockInspection } from './model'
import { lstat } from 'node:fs/promises'
import path from 'pathe'
import { upgradeLockDirectory, UpgradeLockError } from './model'
import {
  isProcessAlive,
  normalizeUpgradeTargetDir,
  readOwner,
} from './owner'

/**
 * Inspect a workspace lock without changing it.
 *
 * This is intentionally separate from acquisition: a stale lock can be
 * recovered by a later upgrade, while an active or malformed lock needs an
 * operator to understand the state before deciding what to do. Keeping this
 * path read-only lets doctor and support tooling report that distinction.
 */
export async function inspectUpgradeLock(targetDir: string): Promise<UpgradeLockInspection> {
  const resolvedTargetDir = await normalizeUpgradeTargetDir(targetDir)
  const lockPath = path.join(resolvedTargetDir, upgradeLockDirectory)
  let info
  try {
    info = await lstat(lockPath)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { path: lockPath, targetDir: resolvedTargetDir, state: 'missing' }
    }
    throw error
  }

  if (!info.isDirectory() || info.isSymbolicLink()) {
    return {
      path: lockPath,
      targetDir: resolvedTargetDir,
      state: 'malformed',
      reason: `Upgrade lock must be a real directory: ${lockPath}`,
    }
  }

  try {
    const owner = await readOwner(lockPath, resolvedTargetDir)
    if (!owner) {
      return {
        path: lockPath,
        targetDir: resolvedTargetDir,
        state: 'malformed',
        reason: `Upgrade lock metadata is missing: ${lockPath}`,
      }
    }
    return {
      path: lockPath,
      targetDir: resolvedTargetDir,
      state: isProcessAlive(owner.pid) ? 'active' : 'stale',
      owner,
    }
  }
  catch (error) {
    if (error instanceof UpgradeLockError) {
      return {
        path: lockPath,
        targetDir: resolvedTargetDir,
        state: 'malformed',
        reason: error.message,
      }
    }
    throw error
  }
}
