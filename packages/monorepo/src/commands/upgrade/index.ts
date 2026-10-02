import type { CliOpts } from '../../types'
import { ensureTemplateAssetsPrepared } from '@icebreakers/monorepo-templates'
import { logger } from '../../core/logger'
import { clearWorkspaceCache } from '../../core/workspace'
import { localize } from '../../i18n'
import { applyUpgradeOperations } from './files'
import { prepareUpgrade } from './plan'
import { selectOperations } from './selection'

export { inspectUpgradeLock, inspectUpgradeTransactions } from './journal'
export { UpgradeLockError } from './journal'
export type { UpgradeJournalOperation, UpgradeLockErrorCode, UpgradeLockInspection, UpgradeLockInspectionState, UpgradeLockOwner, UpgradeTransactionInspection, UpgradeTransactionJournal, UpgradeTransactionLock, UpgradeTransactionState } from './journal'
export { setPkgJson } from './pkg-json'
export { resolveUpgradePlan } from './plan'
export type { UpgradeAction, UpgradeDiff, UpgradeFileIdentity, UpgradePlan, UpgradePlanFile } from './types'

/** Plan, authorize, then apply an upgrade with rollback on failure. */
export async function upgradeMonorepo(options: CliOpts = {}) {
  try {
    await ensureTemplateAssetsPrepared()
    const prepared = await prepareUpgrade(options, true)
    const operations = await selectOperations(prepared)
    const dependencies = new Set(operations.flatMap(item => item.file.dependsOn))
    const observed = prepared.operations.filter(item => dependencies.has(item.file.path) && !operations.includes(item))
    await applyUpgradeOperations(prepared.plan.targetDir, operations, observed)
    for (const operation of operations) {
      logger.success(operation.targetPath)
    }
    for (const file of prepared.plan.files) {
      if (file.reason === 'custom-release') {
        logger.warn(localize('Skipped custom release workflow; use repo upgrade --overwrite-release to replace it.', '已跳过自定义发布工作流；如需替换，请使用 repo upgrade --overwrite-release。'))
      }
    }
  }
  finally {
    // Upgrade may leave user edits in place when an operation fails. Always
    // discard discovery results before callers inspect the workspace again.
    clearWorkspaceCache()
  }
}
