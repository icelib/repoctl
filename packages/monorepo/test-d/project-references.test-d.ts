import type { ProjectReferencesApplyResult, ProjectReferencesCheck, ProjectReferencesConfig, ProjectReferencesPlan } from '..'
import { expectAssignable, expectError, expectType } from 'tsd'
import { applyProjectReferencesPlan, checkProjectReferences, defineMonorepoConfig, planProjectReferences, syncProjectReferences } from '..'

expectAssignable<ProjectReferencesConfig>({ enabled: true, projects: ['packages/*/tsconfig*.json'], relations: [{ source: 'packages/app/tsconfig.json', target: 'packages/lib/tsconfig.json' }] })
defineMonorepoConfig({ tooling: { projectReferences: { enabled: true, exclude: ['packages/legacy/*'] } } })
expectType<Promise<ProjectReferencesPlan>>(planProjectReferences('.'))
expectType<Promise<ProjectReferencesCheck>>(checkProjectReferences('.'))
expectType<Promise<ProjectReferencesApplyResult>>(syncProjectReferences('.'))
expectType<Promise<ProjectReferencesApplyResult>>(applyProjectReferencesPlan(null as unknown as ProjectReferencesPlan))
expectError(defineMonorepoConfig({ tooling: { projectReferences: { enabled: 'true' } } }))
expectError(defineMonorepoConfig({ tooling: { projectReferences: { relations: [{ source: 'a' }] } } }))
