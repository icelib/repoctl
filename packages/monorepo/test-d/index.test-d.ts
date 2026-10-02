/* eslint-disable perfectionist/sort-imports */
import type { CliOpts, CreateChoiceOption, CreateManifestRecoveryResult, CreateNewProjectPlan, CreateTargetInspection, CreateTargetMarker, MonorepoCommitlintConfig, MonorepoTsconfig, MonorepoVitestConfigResult, MonorepoVitestProjectConfigResult, PackageJson, RecoverCreateTargetResult, WorkspacePackageSummaryData } from '..'
import { clearWorkspaceCache, createMonorepoCommitlintConfig, createMonorepoEslintConfig, createMonorepoLintStagedConfig, createMonorepoStylelintConfig, createMonorepoTsconfig, createMonorepoVitestConfig, defineCommitlintConfig, defineEslintConfig, defineVitestConfig, defineVitestProjectConfig, getCreateChoices, getFileHash, getTemplateMap, getWorkspacePackageSummaries, inspectCreateTarget, recoverCreateTarget, resolveCreateNewProjectPlan, templateMap } from '..'
import { expectAssignable, expectType } from 'tsd'

expectType<string>(getFileHash('demo'))
expectType<void>(clearWorkspaceCache())
expectType<Promise<WorkspacePackageSummaryData>>(getWorkspacePackageSummaries('.'))
expectType<'tsdown'>(templateMap.tsdown.source)
expectAssignable<CreateChoiceOption[]>(getCreateChoices())
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

declare const createPlan: CreateNewProjectPlan
expectType<string>(createPlan.workspaceManifest.path)
expectType<boolean>(createPlan.workspaceManifest.changed)
expectType<string | undefined>(createPlan.workspaceManifest.pattern)

const templates = getTemplateMap()

expectType<string | undefined>(templates['tsdown']?.source)
expectAssignable<CliOpts>({ cwd: '.', core: true })
expectAssignable<PackageJson>({ name: 'demo' })
expectAssignable<object>(createMonorepoCommitlintConfig())
expectAssignable<object>(createMonorepoEslintConfig())
expectAssignable<object>(createMonorepoEslintConfig({ ignores: ['dist/**'] }, { rules: { 'no-console': 'off' } }))
expectAssignable<object>(createMonorepoStylelintConfig())
expectAssignable<MonorepoTsconfig>(createMonorepoTsconfig())
expectAssignable<Record<string, unknown>>(createMonorepoLintStagedConfig())
expectAssignable<{ test: object }>(createMonorepoVitestConfig())
expectType<Promise<MonorepoCommitlintConfig>>(defineCommitlintConfig({ cwd: '.' }))
expectAssignable<Promise<object>>(defineEslintConfig({ options: { ignores: ['dist/**'] }, configs: [{ rules: { 'no-console': 'off' } }] }))
expectAssignable<Promise<object>>(defineEslintConfig({ ignores: ['dist/**'] }, { rules: { 'no-alert': 'off' } }))
expectType<Promise<MonorepoVitestConfigResult>>(defineVitestConfig({ options: { includeWorkspaceRootConfig: false } }))
expectType<Promise<MonorepoVitestProjectConfigResult>>(defineVitestProjectConfig({ options: { environment: 'node' } }))
