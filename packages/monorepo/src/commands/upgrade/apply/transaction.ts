import type { UpgradeFilePlan } from '../../../types/upgrade'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, link, lstat, mkdir, rename, rm, rmdir, utimes, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { checkedFile, hash, readOptional } from '../plan/files'

interface StagedFile {
  file: UpgradeFilePlan
  target: string
  temporary: string
  backup: string
  backedUp: boolean
  applied: boolean
}

async function ensureParent(directory: string, created: string[]): Promise<void> {
  try {
    if (!(await lstat(directory)).isDirectory()) {
      throw new Error(`Unsafe parent directory: ${directory}`)
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    await ensureParent(path.dirname(directory), created)
    try {
      await mkdir(directory)
      created.push(directory)
    }
    catch (mkdirError) {
      if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST' || !(await lstat(directory)).isDirectory()) {
        throw mkdirError
      }
    }
  }
}

export async function writeUpgradeTransaction(root: string, files: UpgradeFilePlan[]) {
  const id = randomUUID()
  const staged: StagedFile[] = []
  const directories: string[] = []
  try {
    for (const file of files) {
      const target = await checkedFile(root, file.path)
      const original = await readOptional(root, file.path)
      if ((original === null ? null : hash(original)) !== file.beforeHash) {
        throw new Error(`Upgrade conflict: ${file.path}`)
      }
      await ensureParent(path.dirname(target), directories)
      const item: StagedFile = { file, target, temporary: `${target}.repoctl-upgrade-${id}.tmp`, backup: `${target}.repoctl-upgrade-${id}.bak`, backedUp: false, applied: false }
      staged.push(item)
      if (original !== null) {
        const metadata = await lstat(target)
        await copyFile(target, item.backup, constants.COPYFILE_EXCL)
        item.backedUp = true
        await utimes(item.backup, metadata.atimeMs / 1000, metadata.mtimeMs / 1000)
      }
      if (file.content !== null) {
        const mode = original === null ? 0o666 : (await lstat(target)).mode
        await writeFile(item.temporary, Buffer.from(file.content, 'base64'), { flag: 'wx', mode })
      }
    }
    for (const item of staged) {
      const current = await readOptional(root, item.file.path)
      if ((current === null ? null : hash(current)) !== item.file.beforeHash) {
        throw new Error(`Concurrent upgrade edit: ${item.file.path}`)
      }
      if (item.file.content === null) {
        await rm(item.target)
      }
      else if (current === null) {
        await link(item.temporary, item.target)
        item.applied = true
        await rm(item.temporary)
      }
      else {
        await rename(item.temporary, item.target)
      }
      item.applied = true
    }
  }
  catch (error) {
    const recovery: string[] = []
    for (const item of [...staged].reverse()) {
      try {
        if (item.applied) {
          const current = await readOptional(root, item.file.path)
          if ((current === null ? null : hash(current)) !== item.file.afterHash) {
            throw new Error('Concurrent edit must be retained')
          }
          if (item.backedUp) {
            await rename(item.backup, item.target)
          }
          else {
            await rm(item.target, { force: true })
          }
        }
        else if (item.backedUp) {
          await rm(item.backup)
        }
      }
      catch {
        recovery.push(item.backedUp ? item.backup : item.target)
      }
      await rm(item.temporary, { force: true }).catch(() => {})
    }
    for (const directory of [...directories].reverse()) {
      await rmdir(directory).catch(() => {})
    }
    if (recovery.length) {
      throw new AggregateError([error], `Upgrade failed. Preserve concurrent edits and recover original files from: ${recovery.join(', ')}`)
    }
    throw error
  }
  const retained: string[] = []
  for (const item of staged) {
    try {
      await rm(item.backup, { force: true })
    }
    catch {
      retained.push(item.backup)
    }
  }
  if (retained.length) {
    throw new Error(`Upgrade applied; remove retained backups after review: ${retained.join(', ')}`)
  }
}
