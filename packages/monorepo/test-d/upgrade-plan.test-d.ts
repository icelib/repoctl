import type { UpgradeApplyResult, UpgradeOptions, UpgradePlan } from '..'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'
import { applyUpgradePlan, formatUpgradePlan, planUpgrade, upgradeMonorepo } from '..'

expectType<Promise<UpgradePlan>>(planUpgrade({ cwd: '/workspace', targets: ['package.json'] }))
expectType<Promise<UpgradePlan>>(upgradeMonorepo({ cwd: '/workspace', dryRun: true }))
expectType<Promise<void>>(upgradeMonorepo({ cwd: '/workspace' }))
declare const plan: UpgradePlan
expectType<Promise<UpgradeApplyResult>>(applyUpgradePlan('/workspace', plan, { files: ['package.json'] }))
expectType<string>(formatUpgradePlan(plan, 'markdown'))
expectAssignable<UpgradeOptions>({ dryRun: true, noOverwrite: true })
expectNotAssignable<UpgradeOptions>({ targets: [42] })
