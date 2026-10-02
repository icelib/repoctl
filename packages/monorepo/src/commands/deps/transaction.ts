import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { localize } from '../../i18n'
import { safeFile } from './files'

interface Update {
  path: string
  original: string
  content: string
}

/** Stage every replacement, retain originals until commit, and roll back recoverable failures. */
export async function writeDependencyTransaction(root: string, updates: Update[]) {
  const id = randomUUID()
  const staged: { target: string, temporary: string, backup: string, update: Update, backedUp: boolean }[] = []
  try {
    for (const update of updates) {
      const target = await safeFile(root, update.path)
      if (await readFile(target, 'utf8') !== update.original) {
        throw new Error(localize(`Manifest changed before applying: ${update.path}`, `应用前清单发生变化：${update.path}`))
      }
      const item = { target, temporary: `${target}.repoctl-deps-${id}.tmp`, backup: `${target}.repoctl-deps-${id}.bak`, update, backedUp: false }
      staged.push(item)
      const metadata = await stat(target)
      await copyFile(target, item.backup, constants.COPYFILE_EXCL)
      await utimes(item.backup, metadata.atime, metadata.mtime)
      item.backedUp = true
      await writeFile(item.temporary, update.content, { flag: 'wx', mode: metadata.mode })
    }
    for (const item of staged) {
      await safeFile(root, item.update.path)
      if (await readFile(item.target, 'utf8') !== item.update.original) {
        throw new Error(localize(`Concurrent manifest change: ${item.update.path}`, `清单被并发修改：${item.update.path}`))
      }
      await rename(item.temporary, item.target)
    }
  }
  catch (error) {
    const recovery: string[] = []
    for (const item of [...staged].reverse()) {
      try {
        if (item.backedUp) {
          const current = await readFile(item.target, 'utf8')
          if (current !== item.update.original && current !== item.update.content) {
            throw new Error('Concurrent edit must be preserved')
          }
          await rename(item.backup, item.target)
        }
        else {
          await rm(item.backup, { force: true })
        }
      }
      catch {
        recovery.push(item.backup)
      }
      await rm(item.temporary, { force: true }).catch(() => {})
    }
    if (recovery.length) {
      throw new AggregateError([error], localize(`Dependency fix failed; original backups retained for manual recovery: ${recovery.join(', ')}`, `依赖修复失败；原始备份已保留，请手动恢复：${recovery.join('，')}`))
    }
    throw error
  }
  const leftovers: string[] = []
  for (const item of staged) {
    try {
      await rm(item.backup, { force: true })
    }
    catch {
      leftovers.push(item.backup)
    }
  }
  if (leftovers.length) {
    throw new Error(localize(`Dependency changes were applied; remove retained backups after review: ${leftovers.join(', ')}`, `依赖变更已应用；核查后请删除保留的备份：${leftovers.join('，')}`))
  }
}
