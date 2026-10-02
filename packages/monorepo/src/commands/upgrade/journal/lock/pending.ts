import { lstat, rm, rmdir } from 'node:fs/promises'
import path from 'pathe'

export type LockDirectoryIdentity = Pick<Awaited<ReturnType<typeof lstat>>, 'dev' | 'ino'>

function hasSameDirectoryIdentity(
  info: Awaited<ReturnType<typeof lstat>>,
  expected: LockDirectoryIdentity,
) {
  // A zero inode is not a usable identity on platforms/filesystems that do
  // not expose one. Keeping the path in that case is safer than deleting a
  // directory that may have replaced our failed claim.
  return info.dev !== 0 && info.ino !== 0 && info.dev === expected.dev && info.ino === expected.ino
}

export async function cleanupFailedLock(lockPath: string, expected: LockDirectoryIdentity | undefined) {
  if (!expected) {
    return
  }

  let info: Awaited<ReturnType<typeof lstat>>
  try {
    info = await lstat(lockPath)
  }
  catch {
    return
  }

  // Never follow or remove a path that no longer names the directory we
  // created. `rmdir` deliberately requires an empty directory, so a partial
  // owner.json or foreign content is retained for diagnosis and recovery.
  if (!info.isDirectory() || info.isSymbolicLink() || !hasSameDirectoryIdentity(info, expected)) {
    return
  }
  await rmdir(lockPath).catch(() => {})
}

export function isRenameConflict(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EEXIST' || code === 'ENOTEMPTY' || code === 'EPERM'
}

/**
 * Remove a lock claim that was prepared by this invocation but could not be
 * published because another contender won the atomic rename. The claim has a
 * stable random path, so checking its directory identity before touching it
 * avoids deleting a path that was replaced while the owner metadata was being
 * written.
 */
export async function cleanupPendingLock(
  pendingPath: string,
  expected: LockDirectoryIdentity | undefined,
  metadataFile: string,
) {
  if (!expected) {
    return
  }

  let info: Awaited<ReturnType<typeof lstat>>
  try {
    info = await lstat(pendingPath)
  }
  catch {
    return
  }
  if (!info.isDirectory() || info.isSymbolicLink() || !hasSameDirectoryIdentity(info, expected)) {
    return
  }

  // A successful owner write leaves exactly one regular metadata file. The
  // directory identity proves this claim was created by us, so remove even a
  // partially written file after a failed write. A replacement directory is
  // retained because the identity check above rejects it.
  const ownerPath = path.join(pendingPath, metadataFile)
  try {
    const ownerInfo = await lstat(ownerPath)
    if (!ownerInfo.isFile() || ownerInfo.isSymbolicLink()) {
      return
    }
    await rm(ownerPath, { force: false })
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return
    }
  }

  await cleanupFailedLock(pendingPath, expected)
}
