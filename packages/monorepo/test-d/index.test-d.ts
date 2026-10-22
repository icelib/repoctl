import type { CliOpts, CreateChoiceOption, CreateNewProjectPlan, DoctorReport, DoctorStatus, MonorepoCommitlintConfig, MonorepoConfig, MonorepoTsconfig, MonorepoVitestConfigResult, MonorepoVitestProjectConfigResult, PackageJson, WorkspacePackageSummaryData } from '@icebreakers/monorepo'
import { clearWorkspaceCache, createMonorepoCommitlintConfig, createMonorepoEslintConfig, createMonorepoStylelintConfig, createMonorepoTsconfig, createMonorepoVitestConfig, defineCommitlintConfig, defineEslintConfig, defineVitestConfig, defineVitestProjectConfig, getCreateChoices, getFileHash, getTemplateMap, getWorkspacePackageSummaries, resolveCreateNewProjectPlan, runDoctor, templateMap } from '@icebreakers/monorepo'
import * as tooling from '@icebreakers/monorepo'
import { expectAssignable, expectError, expectType } from 'tsd'

expectType<string>(getFileHash('demo'))
expectType<void>(clearWorkspaceCache())
expectType<Promise<WorkspacePackageSummaryData>>(getWorkspacePackageSummaries('.'))
expectType<'tsdown'>(templateMap.tsdown.source)
expectType<'react-vite'>(templateMap['react-vite'].source)
expectType<'apps/react-vite'>(templateMap['react-vite'].target)
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
tooling.initTooling('.', { targets: ['lefthook'] })
expectError(tooling.initTooling('.', { targets: ['lint-staged'] }))
expectError<MonorepoConfig>({ tooling: { lintStaged: {} } })
expectError<MonorepoConfig>({ tooling: { husky: {} } })
expectError(tooling.defineLintStagedConfig())
expectError(tooling.createMonorepoLintStagedConfig())
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

expectType<'next'>(templateMap.next.source)
expectType<'apps/next'>(templateMap.next.target)
