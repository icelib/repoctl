import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, open, readFile, rename, rm, stat, utimes } from 'node:fs/promises'
import { localize } from '../../i18n'

export interface FileTransactionUpdate {
  path: string
  original: string
  content: string
}

interface StagedFile {
  target: string
  temporary: string
  backup: string
  update: FileTransactionUpdate
  applied: boolean
  backupOwned: boolean
  temporaryOwned: boolean
}

/** Keep preparation, replacement and cleanup separate for transactions that also move directories. */
export async function stageFileTransaction(updates: FileTransactionUpdate[], validate: (file: string) => Promise<string>, namespace: 'deps' | 'remove') {
  const id = randomUUID()
  const staged: StagedFile[] = []
  const check = async (item: StagedFile) => {
    if (await validate(item.update.path) !== item.target) {
      throw new Error(`Transaction target changed: ${item.update.path}`)
    }
  }
  const checkRecoveryFile = async (item: StagedFile, file: 'backup' | 'temporary', content: string) => {
    const relative = item.update.path + item[file].slice(item.target.length)
    if (await validate(relative) !== item[file] || await readFile(item[file], 'utf8') !== content) {
      throw new Error(`Transaction recovery file changed: ${relative}`)
    }
  }
  const rollback = async () => {
    const recovery: string[] = []
    for (const item of [...staged].reverse()) {
      try {
        if (item.applied) {
          await check(item)
          const current = await readFile(item.target, 'utf8')
          if (current !== item.update.original && current !== item.update.content) {
            throw new Error('Concurrent edit must be preserved')
          }
          await checkRecoveryFile(item, 'backup', item.update.original)
          await rename(item.backup, item.target)
          item.backupOwned = false
          item.applied = false
        }
        else if (item.backupOwned) {
          await checkRecoveryFile(item, 'backup', item.update.original)
          await rm(item.backup, { force: true })
          item.backupOwned = false
        }
      }
      catch {
        recovery.push(item.backup)
      }
      try {
        if (item.temporaryOwned) {
          await check(item)
          await checkRecoveryFile(item, 'temporary', item.update.content)
          await rm(item.temporary, { force: true })
          item.temporaryOwned = false
        }
      }
      catch {
        recovery.push(item.temporary)
      }
    }
    return recovery
  }
  try {
    for (const update of updates) {
      const target = await validate(update.path)
      if (await readFile(target, 'utf8') !== update.original) {
        throw new Error(localize(`Manifest changed before applying: ${update.path}`, `应用前清单发生变化：${update.path}`))
      }
      const item: StagedFile = { target, temporary: `${target}.repoctl-${namespace}-${id}.tmp`, backup: `${target}.repoctl-${namespace}-${id}.bak`, update, applied: false, backupOwned: false, temporaryOwned: false }
      staged.push(item)
      const metadata = await stat(target)
      await copyFile(target, item.backup, constants.COPYFILE_EXCL)
      item.backupOwned = true
      await checkRecoveryFile(item, 'backup', update.original)
      await utimes(item.backup, metadata.atimeMs / 1000, metadata.mtimeMs / 1000)
      const temporary = await open(item.temporary, 'wx', metadata.mode)
      item.temporaryOwned = true
      try {
        await temporary.writeFile(update.content, 'utf8')
      }
      finally {
        await temporary.close()
      }
    }
  }
  catch (error) {
    const recovery = await rollback()
    if (recovery.length) {
      throw new AggregateError([error], localize(`File preparation failed; recovery files retained: ${recovery.join(', ')}`, `文件准备失败；已保留恢复文件：${recovery.join('，')}`))
    }
    throw error
  }
  return {
    async apply() {
      for (const item of staged) {
        await check(item)
        if (await readFile(item.target, 'utf8') !== item.update.original) {
          throw new Error(localize(`Concurrent manifest change: ${item.update.path}`, `清单被并发修改：${item.update.path}`))
        }
        await checkRecoveryFile(item, 'temporary', item.update.content)
        await rename(item.temporary, item.target)
        item.applied = true
        item.temporaryOwned = false
      }
    },
    rollback,
    async cleanup() {
      const leftovers: string[] = []
      for (const item of staged) {
        try {
          await check(item)
          await checkRecoveryFile(item, 'backup', item.update.original)
          await rm(item.backup, { force: true })
        }
        catch {
          leftovers.push(item.backup)
        }
      }
      return leftovers
    },
  }
}
