/* eslint-disable perfectionist/sort-imports */
import type { CliOpts, CreateChoiceOption, CreateNewProjectPlan, DoctorReport, DoctorStatus, MonorepoCommitlintConfig, MonorepoTsconfig, MonorepoVitestConfigResult, MonorepoVitestProjectConfigResult, PackageJson, WorkspacePackageSummaryData } from '..'
import { clearWorkspaceCache, createMonorepoCommitlintConfig, createMonorepoEslintConfig, createMonorepoLintStagedConfig, createMonorepoStylelintConfig, createMonorepoTsconfig, createMonorepoVitestConfig, defineCommitlintConfig, defineEslintConfig, defineVitestConfig, defineVitestProjectConfig, getCreateChoices, getFileHash, getTemplateMap, getWorkspacePackageSummaries, resolveCreateNewProjectPlan, runDoctor, templateMap } from '..'
import { expectAssignable, expectType } from 'tsd'

expectType<string>(getFileHash('demo'))
expectType<void>(clearWorkspaceCache())
expectType<Promise<WorkspacePackageSummaryData>>(getWorkspacePackageSummaries('.'))
expectType<'tsdown'>(templateMap.tsdown.source)
expectType<'nimbus'>(templateMap.nimbus.source)
expectType<'apps/docs'>(templateMap.nimbus.target)
expectType<Promise<CreateNewProjectPlan>>(resolveCreateNewProjectPlan({ type: 'nimbus' }))
expectAssignable<CreateChoiceOption[]>(getCreateChoices())
expectType<Promise<CreateNewProjectPlan>>(resolveCreateNewProjectPlan({ cwd: '.', type: 'tsdown' }))

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

expectType<Promise<DoctorReport>>(runDoctor('.'))
expectType<string | undefined>((null as unknown as DoctorReport).checks[0]!.path)
expectType<string | undefined>((null as unknown as DoctorReport).checks[0]!.field)
expectAssignable<DoctorStatus>('warn')
