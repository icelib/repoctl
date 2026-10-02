import type { UpgradeAction, UpgradeDiff, UpgradeFileIdentity, UpgradeJournalOperation, UpgradeLockErrorCode, UpgradeLockInspection, UpgradeLockInspectionState, UpgradePlan, UpgradePlanFile, UpgradeTransactionInspection, UpgradeTransactionState } from '..'
import { expectAssignable, expectType } from 'tsd'
import { inspectUpgradeLock, inspectUpgradeTransactions, resolveUpgradePlan, upgradeMonorepo } from '..'

expectType<Promise<UpgradePlan>>(resolveUpgradePlan({ cwd: '.', noOverwrite: true }))
expectType<Promise<void>>(upgradeMonorepo({ cwd: '.', yes: true }))
expectAssignable<UpgradeAction>('delete')
expectAssignable<UpgradePlanFile>({ path: 'package.json', action: 'update', reason: 'changed', requiresConfirmation: true, dependsOn: [] })
expectAssignable<UpgradeDiff>({ kind: 'text', beforeBytes: 1, afterBytes: 2, beforeHash: null, afterHash: null, addedLines: 1, deletedLines: 0, truncated: false })
expectType<Promise<UpgradeTransactionInspection[]>>(inspectUpgradeTransactions('.'))
expectType<Promise<UpgradeLockInspection>>(inspectUpgradeLock('.'))
expectAssignable<UpgradeLockInspectionState>('stale')
expectAssignable<UpgradeLockInspection>({ path: '.repoctl/upgrade.lock', targetDir: '.', state: 'missing' })
expectAssignable<UpgradeTransactionState>('needs-review')
expectAssignable<UpgradeLockErrorCode>('ERR_REPOCTL_UPGRADE_LOCKED')
expectAssignable<UpgradeFileIdentity>({ dev: 1, ino: 2 })
expectAssignable<UpgradeJournalOperation>({ path: 'package.json', beforeExists: true, afterExists: true, beforeBytes: 1, afterBytes: 2, beforeHash: 'before', afterHash: 'after', applied: true })
expectAssignable<UpgradeTransactionInspection>({
  id: 'upgrade-1',
  path: '.repoctl/transactions/upgrade-1/journal.json',
  targetDir: '.',
  state: 'applying',
  operationCount: 1,
  appliedCount: 0,
  needsReview: true,
})
