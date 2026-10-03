import type { CreateNewProjectPlan, MonorepoConfig } from '@icebreakers/monorepo'
import { applyCreateNewProjectPlan, defineMonorepoConfig, resolveCreateNewProjectPlan } from '@icebreakers/monorepo'
import { expectError, expectType } from 'tsd'

declare const plan: CreateNewProjectPlan
expectType<Promise<CreateNewProjectPlan>>(resolveCreateNewProjectPlan({ parameters: { enabled: true, name: 'sample' }, parameterPrompt: async (_name, definition) => definition.type === 'boolean' ? true : 'sample' }))
expectType<Promise<void>>(applyCreateNewProjectPlan(plan))
expectType<string | boolean | undefined>(plan.parameterization?.values['name'])
expectError(resolveCreateNewProjectPlan({ parameters: { count: 1 } }))
expectError(resolveCreateNewProjectPlan({ parameterPrompt: async () => 123 }))

expectType<MonorepoConfig>(defineMonorepoConfig({ commands: { create: { defaultTemplate: 'tsdown', offline: true, cacheDir: '.cache/templates' } } }))
expectError(defineMonorepoConfig({ commands: { create: { parameters: { enabled: true } } } }))
expectError(defineMonorepoConfig({ commands: { create: { parameterPrompt: async () => true } } }))
