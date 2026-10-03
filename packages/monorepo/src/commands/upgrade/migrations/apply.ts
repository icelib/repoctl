import type { UpgradeFilePlan, UpgradePlan } from '../../../types/upgrade'
import { Buffer } from 'node:buffer'
import { writeUpgradeTransaction } from '../apply/transaction'
import { hash, readOptional } from '../plan/files'
import { ledgerPath, migrationGroup, parseLedger } from './record'

function ledgerOperation(beforeHash: string | null, content: string): UpgradeFilePlan {
  return { path: ledgerPath, beforeHash, afterHash: hash(Buffer.from(content, 'base64')), content, status: beforeHash === null ? 'add' : 'modify', reason: 'migration-attempt-state', detail: 'Reviewed migration attempt state', binary: false, diff: null, automatic: true, group: migrationGroup }
}

/** The final ledger is written last inside the same transaction as migration files. */
export async function applyMigrationFiles(plan: UpgradePlan, files: UpgradeFilePlan[]) {
  const reviewed = plan.migrations?.ledger
  const final = files.find(file => file.path === ledgerPath)
  if (!reviewed || !final) {
    await writeUpgradeTransaction(plan.rootDir, files)
    return
  }
  const pending = ledgerOperation(final.beforeHash, reviewed.pending)
  if (pending.beforeHash !== pending.afterHash) {
    await writeUpgradeTransaction(plan.rootDir, [pending])
  }
  const operations = files.filter(file => file.path !== ledgerPath)
  operations.push({ ...final, beforeHash: pending.afterHash, status: 'modify' })
  const attempt = parseLedger(Buffer.from(reviewed.pending, 'base64')).attempt!
  try {
    // Every recovery plan journals its new attempt before touching retained files.
    await writeUpgradeTransaction(plan.rootDir, operations, attempt.id)
  }
  catch (error) {
    const current = await readOptional(plan.rootDir, ledgerPath)
    if (current !== null && hash(current) === pending.afterHash) {
      try {
        await writeUpgradeTransaction(plan.rootDir, [ledgerOperation(pending.afterHash, reviewed.failed)])
      }
      catch (ledgerError) {
        throw new AggregateError([error, ledgerError], 'Migration failed and its failure record could not be saved. Retain the pending journal and preview recovery.')
      }
    }
    throw error
  }
}
