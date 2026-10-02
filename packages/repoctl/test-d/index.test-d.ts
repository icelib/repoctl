import type { CreateManifestRecoveryResult, CreateNewProjectPlan, CreateTargetInspection, CreateTargetMarker, MonorepoConfig, MonorepoVitestConfigResult, MonorepoVitestProjectConfigResult, RecoverCreateTargetResult, TemplateHealthReport, WorkspacePackageSummaryData } from 'repoctl'
import { checkTemplates, clearWorkspaceCache, defineMonorepoConfig, defineVitestConfig, defineVitestProjectConfig, getWorkspacePackageSummaries, inspectCreateTarget, recoverCreateTarget, resolveCreateNewProjectPlan } from 'repoctl'
import { defineEslintConfig } from 'repoctl/tooling'
import { expectAssignable, expectType } from 'tsd'

expectType<void>(clearWorkspaceCache())
expectType<Promise<WorkspacePackageSummaryData>>(getWorkspacePackageSummaries('.'))
expectType<MonorepoConfig>(defineMonorepoConfig({}))
expectType<MonorepoConfig>(defineMonorepoConfig({
  commands: {
    release: {
      qualityScripts: ['release:lint'],
      hooks: {
        verify: ['release:verify'],
        beforeVersion: ['catalog:sync'],
        afterVersion: ['versions:check'],
        beforePublish: ['versions:check'],
        afterPublish: [{ script: 'marketplace:publish', continueOnError: true }],
      },
    },
  },
}))
expectType<Promise<MonorepoVitestConfigResult>>(defineVitestConfig())
expectType<Promise<MonorepoVitestProjectConfigResult>>(defineVitestProjectConfig())
expectAssignable<Promise<object>>(defineEslintConfig({ options: { ignores: ['dist/**'] }, configs: [{ rules: { 'no-console': 'off' } }] }))
expectAssignable<Promise<object>>(defineEslintConfig({ ignores: ['dist/**'] }, { rules: { 'no-alert': 'off' } }))
expectType<Promise<CreateNewProjectPlan>>(resolveCreateNewProjectPlan({ cwd: '.', type: 'tsdown' }))
expectType<Promise<CreateTargetInspection>>(inspectCreateTarget('.'))
expectType<Promise<RecoverCreateTargetResult>>(recoverCreateTarget('.', { dryRun: true }))
declare const createMarker: CreateTargetMarker
expectType<1 | 2>(createMarker.schemaVersion)
declare const createRecovery: RecoverCreateTargetResult
expectType<CreateManifestRecoveryResult | undefined>(createRecovery.manifest)
declare const manifestRecovery: CreateManifestRecoveryResult
expectType<string>(manifestRecovery.path)
expectType<'unchanged' | 'would-restore' | 'restored' | 'preserved' | 'unknown'>(manifestRecovery.status)
expectType<string | undefined>(manifestRecovery.reason)
expectType<Promise<TemplateHealthReport>>(checkTemplates())
