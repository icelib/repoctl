import type { DependenciesCommandConfig, DependencyApplyResult, DependencyFixOptions, DependencyFixPlan, DependencyReport, MonorepoConfig } from 'repoctl'
import { applyDependencyFixPlan, checkDependencies, planDependencyFix } from 'repoctl'
import { expectAssignable, expectNotAssignable, expectType } from 'tsd'

const options: DependencyFixOptions = { dependency: 'typescript', section: 'devDependencies', to: '^5.0.0' }
expectType<Promise<DependencyReport>>(checkDependencies('.'))
expectType<Promise<DependencyFixPlan>>(planDependencyFix('.', options))
declare const plan: DependencyFixPlan
expectType<Promise<DependencyApplyResult>>(applyDependencyFixPlan('.', plan))
expectAssignable<DependenciesCommandConfig>({ groups: [{ name: 'legacy', workspaces: ['packages/old'], dependencies: ['vue'], reason: 'Vue 2 integration' }] })
expectAssignable<MonorepoConfig>({ commands: { deps: { groups: [] } } })
expectNotAssignable<DependencyFixOptions>({ dependency: 'typescript', section: 'peer', to: '^5' })
expectNotAssignable<DependenciesCommandConfig>({ groups: [{ name: 'unexplained', workspaces: ['.'], dependencies: ['vue'] }] })
