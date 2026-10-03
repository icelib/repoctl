import type { UpgradeApplyResult, UpgradeBaselineChange, UpgradeMergeDetails, UpgradeMigrationsPlan, UpgradeMigrationStep, UpgradeOptions, UpgradePlan } from '..'
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
expectType<UpgradeBaselineChange | undefined>(plan.files[0]!.baseline)
expectType<UpgradeMergeDetails | undefined>(plan.files[0]!.merge)
expectAssignable<UpgradeBaselineChange>({ path: '.repoctl/baselines/root/hash.json', beforeHash: null, afterHash: 'hash', content: 'bytes' })
expectNotAssignable<UpgradeBaselineChange>({ path: 'x', beforeHash: 1, afterHash: null, content: null })
declare const result: UpgradeApplyResult
expectType<string[] | undefined>(result.conflicts)
expectAssignable<UpgradeOptions>({ fromVersion: '1.0.15' })
expectNotAssignable<UpgradeOptions>({ fromVersion: 1 })
expectType<UpgradeMigrationsPlan | undefined>(plan.migrations)
expectType<UpgradeMigrationStep[]>(plan.migrations!.steps)
expectAssignable<UpgradeMigrationStep>({ id: 'migration', version: '1.1.0', status: 'pending', reason: 'version-boundary-crossed', files: ['package.json'] })
expectNotAssignable<UpgradeMigrationStep>({ id: 'migration', version: '1.1.0', status: 'successful', reason: '', files: [] })
