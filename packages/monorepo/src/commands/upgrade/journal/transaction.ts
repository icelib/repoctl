import type { UpgradeFileIdentity, UpgradeOperation } from '../types'
import type { UpgradeJournalOperation, UpgradeTransactionHandle, UpgradeTransactionJournal } from './types'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { assertNoPendingUpgradeTransactions } from './inspect'
import { acquireUpgradeLock, releaseUpgradeLock } from './lock'
import { hash, persist, validateUpgradeOperations } from './shared'
import { upgradeJournalSchemaVersion, upgradeTransactionDirectory } from './types'

const journalFileName = 'journal.json'
const backupDirectoryName = 'backups'

async function assertTransactionDirectory(target: string) {
  try {
    const info = await lstat(target)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`Upgrade transaction directory must be a real directory: ${target}`)
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

/** Ensure one path is a real directory without recursively following races. */
async function ensureTransactionDirectory(target: string, description: string) {
  try {
    const info = await lstat(target)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`${description} must be a real directory: ${target}`)
    }
    return false
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  // Non-recursive mkdir makes a concurrent symlink or replacement fail at
  // this path instead of following it into a foreign directory.
  await mkdir(target)
  const info = await lstat(target)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`${description} must be a real directory: ${target}`)
  }
  return true
}

async function removeEmptyTransactionDirectoryPath(cleanupDirectories: string[]) {
  // Without an identity captured from mkdir+lstat, the transaction path may
  // have been occupied by another process. Leave that path untouched even
  // when it happens to be empty; only parents created by this invocation may
  // be removed, and rmdir keeps non-empty or replaced parents intact.
  for (const parent of [...cleanupDirectories].reverse()) {
    await rmdir(parent).catch((error: NodeJS.ErrnoException) => {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', 'ENOTDIR'].includes(error.code ?? '')) {
        throw error
      }
    })
  }
}

async function removeTransactionDirectoryPath(directory: string, cleanupDirectories: string[], expected: UpgradeFileIdentity) {
  let info
  try {
    info = await lstat(directory)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
  if (!info.isDirectory() || info.isSymbolicLink() || info.dev !== expected.dev || info.ino !== expected.ino) {
    throw new Error(`Upgrade transaction directory changed before cleanup: ${directory}`)
  }

  // Move the owned directory to a private tombstone before recursive removal.
  // If the visible path was replaced between inspection and rename, verify the
  // moved identity and restore it instead of deleting foreign contents.
  const tombstone = `${directory}.${randomUUID()}.removing`
  await rename(directory, tombstone)
  let moved
  try {
    moved = await lstat(tombstone)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
  if (!moved.isDirectory() || moved.isSymbolicLink() || moved.dev !== expected.dev || moved.ino !== expected.ino) {
    try {
      await rename(tombstone, directory)
    }
    catch {
      // Keep the tombstone for inspection if a concurrent owner now occupies
      // the original path.
    }
    throw new Error(`Upgrade transaction directory changed during cleanup: ${directory}`)
  }
  await rm(tombstone, { recursive: true, force: true })
  for (const parent of [...cleanupDirectories].reverse()) {
    await rmdir(parent).catch((error: NodeJS.ErrnoException) => {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', 'ENOTDIR'].includes(error.code ?? '')) {
        throw error
      }
    })
  }
}

export async function beginUpgradeTransaction(targetDir: string, operations: UpgradeOperation[]): Promise<UpgradeTransactionHandle> {
  // Keep the lexical target path used by planned operations. Lock ownership
  // is canonicalized separately so /var and /private/var aliases cannot
  // produce a second lock for the same workspace.
  const resolvedTargetDir = path.resolve(targetDir)
  const lock = await acquireUpgradeLock(resolvedTargetDir)
  const root = path.join(resolvedTargetDir, upgradeTransactionDirectory)
  const transactions = path.dirname(root)
  let directory = path.join(root, `upgrade-${randomUUID()}`)
  let directoryIdentity: UpgradeFileIdentity | undefined
  const cleanupDirectories: string[] = []
  try {
    await assertTransactionDirectory(transactions)
    await assertTransactionDirectory(root)
    await assertNoPendingUpgradeTransactions(resolvedTargetDir)
    const relatives = validateUpgradeOperations(resolvedTargetDir, operations)
    if (await ensureTransactionDirectory(transactions, 'Upgrade transaction parent')) {
      cleanupDirectories.push(transactions)
    }
    if (await ensureTransactionDirectory(root, 'Upgrade transaction directory')) {
      cleanupDirectories.push(root)
    }
    directory = path.join(root, `upgrade-${randomUUID()}`)
    const backups = path.join(directory, backupDirectoryName)
    // Create the transaction directory separately so its identity is known
    // before any nested setup can fail. If backup creation reports an error
    // after creating the directory, the catch block can still remove only
    // this transaction and leave no malformed journal behind.
    await mkdir(directory)
    const directoryInfo = await lstat(directory)
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      throw new Error(`Upgrade transaction directory must be a real directory: ${directory}`)
    }
    directoryIdentity = { dev: directoryInfo.dev, ino: directoryInfo.ino }
    await mkdir(backups)

    const journalOperations: UpgradeJournalOperation[] = []
    for (const [index, operation] of operations.entries()) {
      const relative = relatives[index]!
      const entry: UpgradeJournalOperation = {
        path: relative,
        beforeExists: operation.before !== undefined,
        afterExists: operation.after !== undefined,
        beforeBytes: operation.before?.byteLength ?? 0,
        afterBytes: operation.after?.byteLength ?? 0,
        beforeHash: hash(operation.before),
        afterHash: hash(operation.after),
        applied: false,
      }
      if (operation.beforeIdentity) {
        entry.beforeIdentity = operation.beforeIdentity
      }
      if (operation.mode !== undefined) {
        entry.mode = operation.mode
      }
      if (operation.before !== undefined) {
        const backup = `${backupDirectoryName}/${index}.bin`
        await writeFile(path.join(directory, backup), operation.before)
        entry.backup = backup
      }
      journalOperations.push(entry)
    }

    const now = Date.now()
    const journal: UpgradeTransactionJournal = {
      schemaVersion: upgradeJournalSchemaVersion,
      id: path.basename(directory),
      pid: process.pid,
      targetDir: resolvedTargetDir,
      createdAt: now,
      updatedAt: now,
      state: 'applying',
      operations: journalOperations,
    }
    const handle: UpgradeTransactionHandle = {
      directory,
      journalPath: path.join(directory, journalFileName),
      journal,
      directoryIdentity,
      cleanupDirectories,
      lock,
    }
    await persist(handle)
    return handle
  }
  catch (error) {
    if (directoryIdentity) {
      await removeTransactionDirectoryPath(directory, cleanupDirectories, directoryIdentity).catch(() => {})
    }
    else {
      await removeEmptyTransactionDirectoryPath(cleanupDirectories).catch(() => {})
    }
    await releaseUpgradeLock(lock).catch(() => {})
    throw error
  }
}

export async function markUpgradeOperationApplied(handle: UpgradeTransactionHandle, relativePath: string, afterIdentity?: UpgradeFileIdentity) {
  const operation = handle.journal.operations.find(item => item.path === relativePath && !item.applied)
  if (!operation) {
    throw new Error(`Upgrade journal operation was not found: ${relativePath}`)
  }
  operation.applied = true
  if (afterIdentity) {
    operation.afterIdentity = afterIdentity
  }
  await persist(handle)
}

export async function markUpgradeTransactionNeedsReview(handle: UpgradeTransactionHandle, error: unknown) {
  handle.journal.state = 'needs-review'
  handle.journal.error = error instanceof Error ? error.message : String(error)
  await persist(handle)
  // The journal is now durable and no further mutation is allowed. Release
  // the process lock so a later invocation can inspect and recover it.
  await releaseUpgradeLock(handle.lock)
}

async function removeTransactionDirectory(handle: UpgradeTransactionHandle) {
  await removeTransactionDirectoryPath(handle.directory, handle.cleanupDirectories, handle.directoryIdentity)
  // Keep the successful path invisible to callers. User-created files inside
  // `.repoctl` are preserved, and pre-existing empty parents are retained.
}

export async function completeUpgradeTransaction(handle: UpgradeTransactionHandle) {
  let failure: unknown
  try {
    handle.journal.state = 'completed'
    await persist(handle)
    await removeTransactionDirectory(handle)
  }
  catch (error) {
    failure = error
  }
  try {
    await releaseUpgradeLock(handle.lock)
  }
  catch (error) {
    if (failure !== undefined) {
      throw new AggregateError([failure, error], 'Upgrade completed but could not release its workspace lock')
    }
    throw error
  }
  if (failure !== undefined) {
    throw failure
  }
}

export async function discardUpgradeTransaction(handle: UpgradeTransactionHandle) {
  let failure: unknown
  try {
    await removeTransactionDirectory(handle)
  }
  catch (error) {
    failure = error
  }
  try {
    await releaseUpgradeLock(handle.lock)
  }
  catch (error) {
    if (failure !== undefined) {
      throw new AggregateError([failure, error], 'Upgrade cleanup failed and could not release its workspace lock')
    }
    throw error
  }
  if (failure !== undefined) {
    throw failure
  }
}
