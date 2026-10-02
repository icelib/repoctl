import type { BigIntStats } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, realpath, rmdir, unlink } from 'node:fs/promises'
import path from 'pathe'

/** Serialize validation, mutation, rollback and cleanup, including identical concurrent plans. */
export async function withOperationLock<T>(root: string, name: 'typescript-references' | 'doctor-fix' | 'workspace-move' | 'workspace-remove' | 'upgrade' | 'api-reports', run: () => Promise<T>): Promise<T> {
  const lockFile = `.repoctl/${name}.lock`
  const filename = path.join(root, lockFile)
  const directory = path.join(root, '.repoctl')
  const validateDirectory = async () => {
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.normalize(await realpath(directory)) !== directory) {
      throw new Error(`Unsafe operation lock directory: ${directory}`)
    }
  }
  // File IDs can exceed Number.MAX_SAFE_INTEGER, particularly on Windows.
  let createdDirectory: BigIntStats | undefined
  try {
    await mkdir(directory)
    createdDirectory = await lstat(directory, { bigint: true })
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error
    }
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined
  let identity: BigIntStats | undefined
  let written = false
  const token = `${randomUUID()}\n`
  const failures: unknown[] = []
  let result: T | undefined
  try {
    await validateDirectory()
    try {
      handle = await open(filename, 'wx')
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Operation ${name} is locked: ${lockFile}. After a crash, verify no writer is active and recover pending backups before removing this lock.`)
      }
      throw error
    }
    identity = await handle.stat({ bigint: true })
    await handle.writeFile(token)
    written = true
    result = await run()
  }
  catch (error) {
    failures.push(error)
  }
  try {
    await handle?.close()
    if (identity) {
      await validateDirectory()
      const current = await lstat(filename, { bigint: true })
      if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n || current.ino !== identity.ino || current.dev !== identity.dev || (written && await readFile(filename, 'utf8') !== token)) {
        throw new Error('Operation lock ownership changed')
      }
      await unlink(filename)
    }
  }
  catch (error) {
    failures.push(new Error(`Operation lock cleanup needs attention; preserve ${lockFile}.`, { cause: error }))
  }
  if (createdDirectory) {
    try {
      await validateDirectory()
      const current = await lstat(directory, { bigint: true })
      if (current.ino === createdDirectory.ino && current.dev === createdDirectory.dev) {
        await rmdir(directory)
      }
    }
    catch {}
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, `Operation failed and lock cleanup needs attention; preserve ${lockFile}.`)
  }
  if (failures.length) {
    throw failures[0]
  }
  return result as T
}
