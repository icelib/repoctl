import type { UpgradeApplyResult, UpgradePlan } from 'repoctl'
import { applyUpgradePlan, formatUpgradePlan, planUpgrade, upgradeMonorepo } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<UpgradePlan>>(planUpgrade({ cwd: '/workspace' }))
expectType<Promise<UpgradePlan>>(upgradeMonorepo({ cwd: '/workspace', dryRun: true }))
declare const plan: UpgradePlan
expectType<Promise<UpgradeApplyResult>>(applyUpgradePlan('/workspace', plan))
expectType<string>(formatUpgradePlan(plan))
