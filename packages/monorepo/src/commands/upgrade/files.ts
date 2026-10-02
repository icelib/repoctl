import type { Buffer } from 'node:buffer'
import type { UpgradeFileIdentity, UpgradeOperation } from './types'
import { lstat, mkdir, rmdir, unlink } from 'node:fs/promises'
import path from 'pathe'
import fs from '../../utils/fs'
import {
  beginUpgradeTransaction,
  completeUpgradeTransaction,
  discardUpgradeTransaction,
  markUpgradeOperationApplied,
  markUpgradeTransactionNeedsReview,
  relativeUpgradeOperationPath,
} from './journal'

export async function readUpgradeFile(targetPath: string): Promise<Buffer | undefined> {
  try {
    const info = await lstat(targetPath)
    if (!info.isFile()) {
      throw new Error(`Upgrade target must be a regular file: ${targetPath}`)
    }
    return await fs.readFile(targetPath)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

export function sameContent(left: Buffer | undefined, right: Buffer | undefined) {
  return left === undefined ? right === undefined : right !== undefined && left.equals(right)
}

function sameIdentity(left: UpgradeFileIdentity | undefined, right: UpgradeFileIdentity | undefined) {
  return left !== undefined && right !== undefined && left.dev === right.dev && left.ino === right.ino
}

async function readUpgradeIdentity(targetPath: string): Promise<UpgradeFileIdentity | undefined> {
  try {
    const info = await lstat(targetPath)
    if (!info.isFile()) {
      return undefined
    }
    return { dev: info.dev, ino: info.ino }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

interface AppliedUpgradeOperation {
  operation: UpgradeOperation
  completed: boolean
}

async function restoreOperation(operation: UpgradeOperation, completed: boolean): Promise<boolean> {
  let current: Buffer | undefined
  try {
    current = await readUpgradeFile(operation.targetPath)
  }
  catch {
    // A user-replaced directory or symlink must be left intact during
    // rollback.  The same rule applies when the failed operation did not
    // finish: an unknown target state may belong to the user.
    return true
  }

  const currentIdentity = await readUpgradeIdentity(operation.targetPath)
  if (operation.afterIdentity && !sameIdentity(currentIdentity, operation.afterIdentity)) {
    // The path was replaced after this transaction's write.  Leave the
    // replacement intact and retain the journal for explicit review instead
    // of silently discarding evidence and restoring over user data.
    return true
  }

  // Atomic writes leave the original content in place when they fail.  A
  // failed delete may likewise leave the original file untouched.  Avoid a
  // needless rewrite in either case.  If a failed operation somehow did
  // reach its expected state before throwing, it is safe to undo it.  Any
  // other state is ambiguous (for example a concurrent user edit), so leave
  // it intact instead of clobbering user data.
  if (completed) {
    if (!sameContent(current, operation.after)) {
      // A completed operation no longer owns this content.  This includes a
      // user-created file after a delete (where `after` is undefined), so the
      // original must not be written back automatically.
      return true
    }
  }
  else if (sameContent(current, operation.before)) {
    return false
  }
  else {
    // A failed non-atomic write or delete can leave any state behind.  Do not
    // guess whether that state belongs to the failed operation or a user;
    // preserve it and force the transaction into needs-review.
    return true
  }

  if (operation.before === undefined) {
    await unlink(operation.targetPath).catch((failure: NodeJS.ErrnoException) => {
      if (failure.code !== 'ENOENT') {
        throw failure
      }
    })
  }
  else {
    await fs.writeFile(operation.targetPath, operation.before, { mode: operation.mode })
  }
  return false
}

export async function assertUpgradeParents(targetDir: string, targetPath: string) {
  const resolvedTargetDir = path.resolve(targetDir)
  const resolvedTargetPath = path.resolve(targetPath)
  const relative = path.relative(resolvedTargetDir, resolvedTargetPath)
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Upgrade target escapes workspace: ${targetPath}`)
  }
  let current = path.dirname(resolvedTargetPath)
  while (current !== resolvedTargetDir && current.startsWith(`${resolvedTargetDir}${path.sep}`)) {
    try {
      const info = await lstat(current)
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`Upgrade parent must be a directory, not a symbolic link: ${current}`)
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
    current = path.dirname(current)
  }
}

/** Apply one accepted plan; restore all touched files if any operation fails. */
export async function applyUpgradeOperations(targetDir: string, operations: UpgradeOperation[], dependencies: UpgradeOperation[] = []) {
  for (const operation of [...operations, ...dependencies]) {
    await assertUpgradeParents(targetDir, operation.targetPath)
    if (!sameContent(await readUpgradeFile(operation.targetPath), operation.before)) {
      throw new Error(`Upgrade target changed after planning: ${operation.file.path}`)
    }
    if (operation.before !== undefined) {
      const info = await lstat(operation.targetPath)
      operation.mode = info.mode
      operation.beforeIdentity = { dev: info.dev, ino: info.ino }
    }
  }

  const ordered = [...operations].sort((left, right) => Number(left.after === undefined) - Number(right.after === undefined))
  const transaction = await beginUpgradeTransaction(targetDir, ordered)
  const applied: AppliedUpgradeOperation[] = []
  let needsReview = false
  const directories = new Set<string>()
  try {
    // Legacy metadata is removed only after every replacement has been written.
    for (const operation of ordered) {
      // A migration can depend on a managed file that is unchanged and is
      // therefore not part of `ordered`. Recheck those observed dependencies
      // immediately before every write/delete as well as during preflight.
      // Otherwise a concurrent edit after preflight could leave legacy state
      // removed even though the migration input no longer matches the plan.
      for (const dependency of dependencies) {
        await assertUpgradeParents(targetDir, dependency.targetPath)
        if (!sameContent(await readUpgradeFile(dependency.targetPath), dependency.before)) {
          throw new Error(`Upgrade dependency changed after planning: ${dependency.file.path}`)
        }
      }
      // Re-check immediately before each mutation.  The initial preflight
      // protects the plan as a whole, while this check closes the common
      // window where another process edits a later file during an earlier
      // operation.
      if (!sameContent(await readUpgradeFile(operation.targetPath), operation.before)) {
        throw new Error(`Upgrade target changed after planning: ${operation.file.path}`)
      }
      if (operation.after !== undefined) {
        // A parent can be replaced after the preflight. Recheck immediately
        // before mkdir so a newly introduced symlink cannot redirect writes
        // outside the workspace.
        await assertUpgradeParents(targetDir, operation.targetPath)
        const parent = path.dirname(operation.targetPath)
        const firstCreated = await mkdir(parent, { recursive: true })
        if (firstCreated) {
          const firstDirectory = path.resolve(firstCreated)
          let current = parent
          while (true) {
            directories.add(current)
            if (current === firstDirectory) {
              break
            }
            const next = path.dirname(current)
            if (next === current) {
              throw new Error(`Cannot track created directory: ${firstCreated}`)
            }
            current = next
          }
        }
        // `mkdir()` can race with a user replacing one of the newly-created
        // parents (for example with a symlink) before the atomic file write.
        // Validate the complete parent chain again after mkdir so a replacement
        // cannot redirect the temporary file and rename outside the workspace.
        await assertUpgradeParents(targetDir, operation.targetPath)
      }
      const appliedOperation: AppliedUpgradeOperation = { operation, completed: false }
      applied.push(appliedOperation)
      if (operation.after === undefined) {
        await unlink(operation.targetPath)
      }
      else {
        await fs.outputFileAtomic(operation.targetPath, operation.after, operation.mode === undefined ? undefined : { mode: operation.mode })
      }
      appliedOperation.completed = true
      const afterIdentity = await readUpgradeIdentity(operation.targetPath)
      if (afterIdentity) {
        operation.afterIdentity = afterIdentity
      }
      await markUpgradeOperationApplied(transaction, relativeUpgradeOperationPath(targetDir, operation.targetPath), afterIdentity)
    }
  }
  catch (error) {
    const failures: unknown[] = [error]
    for (const { operation, completed } of applied.reverse()) {
      try {
        // Always attempt every earlier operation. Short-circuiting on an
        // already ambiguous operation would skip restoring files that are
        // still provably owned by this transaction.
        const operationNeedsReview = await restoreOperation(operation, completed)
        needsReview ||= operationNeedsReview
      }
      catch (failure) {
        failures.push(failure)
      }
    }
    for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
      try {
        await rmdir(directory)
      }
      catch (failure) {
        if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes((failure as NodeJS.ErrnoException).code ?? '')) {
          failures.push(failure)
        }
      }
    }
    if (failures.length > 1 || needsReview) {
      await markUpgradeTransactionNeedsReview(transaction, failures[0]).catch(failure => failures.push(failure))
      if (failures.length > 1) {
        throw new AggregateError(failures, 'Upgrade failed and could not fully restore the original files')
      }
      throw error
    }
    await discardUpgradeTransaction(transaction)
    throw error
  }
  // Commit the journal only after every managed operation has completed.  If
  // cleanup itself is interrupted, a completed journal is safe to remove on
  // the next inspection and must never trigger a rollback of user files.
  await completeUpgradeTransaction(transaction)
}
