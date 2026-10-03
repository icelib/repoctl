import type { FileTransactionUpdate } from '../../core/file-transaction'
import { stageFileTransaction } from '../../core/file-transaction'
import { localize } from '../../i18n'
import { safeFile } from './files'

/** Stage every replacement, retain originals until commit, and roll back recoverable failures. */
export async function writeDependencyTransaction(root: string, updates: FileTransactionUpdate[]) {
  const transaction = await stageFileTransaction(updates, file => safeFile(root, file), 'deps')
  try {
    await transaction.apply()
  }
  catch (error) {
    const recovery = await transaction.rollback()
    if (recovery.length) {
      throw new AggregateError([error], localize(`Dependency fix failed; original backups retained for manual recovery: ${recovery.join(', ')}`, `依赖修复失败；原始备份已保留，请手动恢复：${recovery.join('，')}`))
    }
    throw error
  }
  const leftovers = await transaction.cleanup()
  if (leftovers.length) {
    throw new Error(localize(`Dependency changes were applied; remove retained backups after review: ${leftovers.join(', ')}`, `依赖变更已应用；核查后请删除保留的备份：${leftovers.join('，')}`))
  }
}
