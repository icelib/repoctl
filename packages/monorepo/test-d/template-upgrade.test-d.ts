import type { TemplateUpgradeOptions, TemplateUpgradePlan, TemplateUpgradeRecoveryResult, TemplateUpgradeResult } from '..'
import { expectError, expectType } from 'tsd'
import { applyTemplateUpgradePlan, planTemplateUpgrade, recoverTemplateUpgrade } from '..'

declare const options: TemplateUpgradeOptions
declare const plan: TemplateUpgradePlan
expectType<Promise<TemplateUpgradePlan>>(planTemplateUpgrade(options))
expectType<Promise<TemplateUpgradeResult>>(applyTemplateUpgradePlan(plan))
expectType<Promise<TemplateUpgradeRecoveryResult>>(recoverTemplateUpgrade('/workspace', 'packages/library', true))
expectType<'upgrade' | 'unchanged' | 'conflict'>(plan.action)
expectType<string[] | undefined>(options.exclude)
expectError(planTemplateUpgrade({ cwd: '/workspace', version: '2.0.0' }))
expectError(planTemplateUpgrade({ cwd: '/workspace', instance: 'packages/library', version: '2.0.0', exclude: '**' }))
expectError(recoverTemplateUpgrade('/workspace', 'packages/library', 'yes'))
