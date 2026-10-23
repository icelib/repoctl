import type { MonorepoConfig, UpgradeApplyResult, UpgradeBaselineChange, UpgradeKeepDecision, UpgradeMergeDetails, UpgradeMigrationsPlan, UpgradeMigrationStep, UpgradeOptions, UpgradeOverrideFinding, UpgradePlan, UpgradeWorkspacePolicy } from '@icebreakers/monorepo'
import { applyUpgradePlan, formatUpgradePlan, planUpgrade, upgradeMonorepo } from '@icebreakers/monorepo'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

expectType<Promise<UpgradePlan>>(planUpgrade({ cwd: '/workspace', targets: ['package.json'] }))
expectType<Promise<UpgradePlan>>(upgradeMonorepo({ cwd: '/workspace', dryRun: true }))
expectType<Promise<void>>(upgradeMonorepo({ cwd: '/workspace' }))
declare const plan: UpgradePlan
expectType<Promise<UpgradeApplyResult>>(applyUpgradePlan('/workspace', plan, { files: ['package.json'] }))
expectType<string>(formatUpgradePlan(plan, 'markdown'))
expectAssignable<UpgradePlan['inputs'][number]>({ area: 'package', path: 'package.json', hash: null })
expectNotAssignable<UpgradePlan['inputs'][number]>({ area: 'installed', path: 'package.json', hash: null })
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

declare const keep: UpgradeKeepDecision
expectAssignable<MonorepoConfig>({ commands: { upgrade: { keep: [keep] } } })
expectAssignable<UpgradeKeepDecision>({ file: 'pnpm-workspace.yaml', path: ['overrides', '@scope/package.name'], reason: 'Host boundary', upstreamHash: 'hash', localHash: 'hash', expires: '2030-01-01' })
expectNotAssignable<UpgradeKeepDecision>({ file: 'package.json', path: ['overrides', 'vite'], reason: 'Host boundary', upstreamHash: 'hash', localHash: 'hash' })
expectNotAssignable<UpgradeKeepDecision>({ file: 'pnpm-workspace.yaml', path: 'overrides.vite', reason: 'Host boundary', upstreamHash: 'hash', localHash: 'hash' })
expectType<UpgradeWorkspacePolicy | undefined>(plan.files[0]!.workspacePolicy)
expectType<UpgradeOverrideFinding[]>(plan.files[0]!.workspacePolicy!.findings)
