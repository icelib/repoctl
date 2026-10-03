import type { UpgradeApplyResult, UpgradeBaselineChange, UpgradeMergeDetails, UpgradeMigrationsPlan, UpgradePlan } from 'repoctl'
import { applyUpgradePlan, formatUpgradePlan, planUpgrade, upgradeMonorepo } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<UpgradePlan>>(planUpgrade({ cwd: '/workspace' }))
expectType<Promise<UpgradePlan>>(upgradeMonorepo({ cwd: '/workspace', dryRun: true }))
declare const plan: UpgradePlan
expectType<Promise<UpgradeApplyResult>>(applyUpgradePlan('/workspace', plan))
expectType<string>(formatUpgradePlan(plan))
expectType<UpgradeBaselineChange | undefined>(plan.files[0]!.baseline)
expectType<UpgradeMergeDetails | undefined>(plan.files[0]!.merge)
declare const result: UpgradeApplyResult
expectType<string[] | undefined>(result.conflicts)
expectType<Promise<UpgradePlan>>(planUpgrade({ cwd: '/workspace', fromVersion: '1.0.15' }))
expectType<UpgradeMigrationsPlan | undefined>(plan.migrations)
