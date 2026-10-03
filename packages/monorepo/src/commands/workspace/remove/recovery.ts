import type { WorkspaceRemovalEntry } from '../../../types/removal'
import { lstat, mkdir, mkdtemp, readdir, realpath, rename, rm, rmdir } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { assertSafePath } from '../../clean/safety'
import { removalInventory } from './inventory'

export interface RemovalRecovery {
  directory: string
  packageDirectory: string
  created: string[]
}

async function validateRoot(root: string) {
  if ((await lstat(root)).isSymbolicLink() || path.resolve(await realpath(root)) !== root) {
    throw new Error('The removal workspace root changed.')
  }
}

export async function prepareRemovalRecovery(root: string): Promise<RemovalRecovery> {
  await validateRoot(root)
  const created: string[] = []
  let directory = root
  let operation: string | undefined
  try {
    for (const component of ['node_modules', '.cache', 'repoctl', 'removals']) {
      directory = path.join(directory, component)
      try {
        await lstat(directory)
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
        try {
          await mkdir(directory)
          created.push(directory)
        }
        catch (creationError) {
          if ((creationError as NodeJS.ErrnoException).code !== 'EEXIST') {
            throw creationError
          }
        }
      }
      await assertSafePath(root, directory, 'directory')
    }
    directory = path.resolve(await mkdtemp(path.join(directory, 'remove-')))
    operation = directory
    await assertSafePath(root, directory, 'directory')
    return { directory, packageDirectory: path.join(directory, 'package'), created }
  }
  catch (error) {
    const retained: string[] = []
    for (const file of [...created, ...(operation ? [operation] : [])].reverse()) {
      try {
        await validateRoot(root)
        await assertSafePath(root, file, 'directory')
        await rmdir(file)
      }
      catch {
        retained.push(file)
      }
    }
    if (retained.length) {
      throw new AggregateError([error], `Removal recovery preparation failed; inspect retained directories: ${retained.join(', ')}`)
    }
    throw error
  }
}

export async function restoreRemovedDirectory(root: string, recovery: RemovalRecovery, target: string) {
  await validateRoot(root)
  await assertSafePath(root, recovery.packageDirectory, 'directory')
  const parent = path.dirname(target)
  if (parent !== root) {
    await assertSafePath(root, parent, 'directory')
  }
  const exists = await lstat(target).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return false
    }
    throw error
  })
  if (exists) {
    throw new Error('A concurrent replacement of the removed directory must be preserved.')
  }
  await rename(recovery.packageDirectory, target)
}

/** Only the unique operation directory is recursive cleanup; shared parents are removed only if empty. */
export async function cleanupRemovalRecovery(root: string, recovery: RemovalRecovery, inventory?: WorkspaceRemovalEntry[]) {
  try {
    await validateRoot(root)
    await assertSafePath(root, recovery.directory, 'directory')
    if (inventory) {
      if (!isDeepStrictEqual(await readdir(recovery.directory), ['package'])
        || !isDeepStrictEqual((await removalInventory(root, recovery.packageDirectory)).entries, inventory)) {
        return [recovery.directory]
      }
      await rm(recovery.packageDirectory, { recursive: true })
    }
    await rmdir(recovery.directory)
  }
  catch {
    return [recovery.directory]
  }
  for (const directory of [...recovery.created].reverse()) {
    try {
      await assertSafePath(root, directory, 'directory')
      await rmdir(directory)
    }
    catch {
      // A parent may now contain another task's cache. Its contents are never removed.
    }
  }
  return []
}
