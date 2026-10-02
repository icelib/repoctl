import type { CreateNewProjectPlan, DoctorReport, DoctorStatus, MonorepoConfig, MonorepoVitestConfigResult, MonorepoVitestProjectConfigResult, TemplateHealthReport, WorkspacePackageSummaryData } from 'repoctl'
import { checkTemplates, clearWorkspaceCache, defineMonorepoConfig, defineVitestConfig, defineVitestProjectConfig, getWorkspacePackageSummaries, resolveCreateNewProjectPlan, runDoctor } from 'repoctl'
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
expectType<Promise<TemplateHealthReport>>(checkTemplates())

expectType<Promise<DoctorReport>>(runDoctor('.'))
expectType<string | undefined>((null as unknown as DoctorReport).checks[0]!.path)
expectType<string | undefined>((null as unknown as DoctorReport).checks[0]!.field)
expectAssignable<DoctorStatus>('warn')
