import type { UpgradeFilePlan } from '../../../../types/upgrade'
import type { Identity, OwnedDirectory, OwnedFile } from './state'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { link, lstat, rename, rm, utimes } from 'node:fs/promises'
import path from 'pathe'
import { checkedFile, hash, readOptional } from '../../plan/files'
import { cleanDirectories, ensureParent, removeOwnedFile, stageOwnedFile, verifyOwnedFile } from './state'

interface StagedFile {
  file: UpgradeFilePlan
  target: string
  temporary: OwnedFile
  backup: OwnedFile
  applied: boolean
  appliedIdentity?: Identity
}

async function rollback(root: string, staged: StagedFile[]) {
  const recovery: string[] = []
  for (const item of [...staged].reverse()) {
    try {
      if (item.applied) {
        const current = await readOptional(root, item.file.path, item.appliedIdentity)
        if ((current === null ? null : hash(current)) !== item.file.afterHash) {
          throw new Error('Concurrent edit must be retained')
        }
        if (current !== null && item.appliedIdentity) {
          const info = await lstat(item.target)
          if (info.ino !== item.appliedIdentity.ino || info.dev !== item.appliedIdentity.dev) {
            throw new Error('Concurrent replacement must be retained')
          }
        }
        if (item.backup.owned) {
          await verifyOwnedFile(root, item.backup)
          if (current === null) {
            await link(item.backup.path, item.target)
            await removeOwnedFile(root, item.backup)
          }
          else {
            await rename(item.backup.path, item.target)
            item.backup.owned = false
          }
        }
        else {
          await rm(item.target)
        }
      }
      else {
        await removeOwnedFile(root, item.backup)
      }
    }
    catch {
      recovery.push(item.backup.owned ? item.backup.path : item.target)
    }
    try {
      await removeOwnedFile(root, item.temporary)
    }
    catch {
      recovery.push(item.temporary.path)
    }
  }
  return recovery
}

export async function writeUpgradeTransaction(root: string, files: UpgradeFilePlan[], id: string = randomUUID()) {
  const staged: StagedFile[] = []
  const directories: OwnedDirectory[] = []
  try {
    for (const file of files) {
      const target = await checkedFile(root, file.path)
      const original = await readOptional(root, file.path)
      if ((original === null ? null : hash(original)) !== file.beforeHash) {
        throw new Error(`Upgrade conflict: ${file.path}`)
      }
      await ensureParent(path.dirname(target), directories)
      const item: StagedFile = {
        file,
        target,
        applied: false,
        temporary: { path: `${target}.repoctl-upgrade-${id}.tmp`, hash: file.afterHash ?? '', owned: false },
        backup: { path: `${target}.repoctl-upgrade-${id}.bak`, hash: file.beforeHash ?? '', owned: false },
      }
      staged.push(item)
      const metadata = original === null ? null : await lstat(target)
      if (original !== null && metadata) {
        await stageOwnedFile(root, item.backup, original, metadata.mode)
        await utimes(item.backup.path, metadata.atimeMs / 1000, metadata.mtimeMs / 1000)
      }
      if (file.content !== null) {
        await stageOwnedFile(root, item.temporary, Buffer.from(file.content, 'base64'), metadata?.mode)
      }
    }
    for (const item of staged) {
      const current = await readOptional(root, item.file.path)
      if ((current === null ? null : hash(current)) !== item.file.beforeHash) {
        throw new Error(`Concurrent upgrade edit: ${item.file.path}`)
      }
      if (item.file.content === null) {
        await rm(item.target)
        item.applied = true
      }
      else {
        await verifyOwnedFile(root, item.temporary)
        if (current === null) {
          await link(item.temporary.path, item.target)
          item.applied = true
          item.appliedIdentity = item.temporary.identity!
          await removeOwnedFile(root, item.temporary)
        }
        else {
          await rename(item.temporary.path, item.target)
          item.applied = true
          item.appliedIdentity = item.temporary.identity!
          item.temporary.owned = false
        }
      }
    }
  }
  catch (error) {
    const recovery = await rollback(root, staged)
    await cleanDirectories(directories)
    if (recovery.length) {
      throw new AggregateError([error], `Upgrade failed. Preserve concurrent edits and recover original files from: ${recovery.join(', ')}`)
    }
    throw error
  }
  const retained: string[] = []
  for (const item of staged) {
    try {
      await removeOwnedFile(root, item.backup)
    }
    catch {
      retained.push(item.backup.path)
    }
  }
  if (retained.length) {
    throw new Error(`Upgrade applied; remove retained backups after review: ${retained.join(', ')}`)
  }
}
