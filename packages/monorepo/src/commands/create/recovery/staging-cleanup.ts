import type { Stats } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { lstat, rename, rm } from 'node:fs/promises'

function sameDirectoryIdentity(left: Pick<Stats, 'dev' | 'ino'>, right: Pick<Stats, 'dev' | 'ino'>) {
  // A zero device or inode is not a useful ownership proof on filesystems
  // that do not expose one.  Keeping the staging directory in that case is
  // safer than recursively removing a path that may have been replaced.
  return left.dev !== 0 && left.ino !== 0 && left.dev === right.dev && left.ino === right.ino
}

/**
 * Remove a staging directory created by this invocation after checking that
 * the path still names the same directory.  The tombstone makes the final
 * recursive removal safe when a user replaces the visible path between the
 * identity check and rename.
 */
export async function removeCreateStaging(stagingDir: string, expected?: Pick<Stats, 'dev' | 'ino'>) {
  if (!expected) {
    return
  }

  let info: Stats
  try {
    info = await lstat(stagingDir)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
  if (!info.isDirectory() || info.isSymbolicLink() || !sameDirectoryIdentity(info, expected)) {
    return
  }

  const tombstone = `${stagingDir}.${randomUUID()}.removing`
  try {
    await rename(stagingDir, tombstone)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }

  let moved: Stats
  try {
    moved = await lstat(tombstone)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
  if (!moved.isDirectory() || moved.isSymbolicLink() || !sameDirectoryIdentity(moved, expected)) {
    // A replacement won the race.  Restore the moved entry when the visible
    // path is still free; if another owner now occupies it, retain the
    // tombstone for explicit inspection rather than deleting foreign data.
    await rename(tombstone, stagingDir).catch((error) => {
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw error
      }
    })
    return
  }

  try {
    await rm(tombstone, { recursive: true, force: false })
  }
  catch (error) {
    // Keep a failed cleanup recoverable.  Restore the original path only when
    // it is still free; a concurrent replacement wins and the tombstone stays
    // available for manual cleanup.
    await rename(tombstone, stagingDir).catch((restoreError) => {
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes((restoreError as NodeJS.ErrnoException).code ?? '')) {
        throw restoreError
      }
    })
    throw error
  }
}
