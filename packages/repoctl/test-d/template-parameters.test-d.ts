import type { CreateNewProjectPlan, MonorepoConfig } from 'repoctl'
import { defineMonorepoConfig, resolveCreateNewProjectPlan } from 'repoctl'
import { expectNotAssignable, expectType } from 'tsd'

expectType<Promise<CreateNewProjectPlan>>(resolveCreateNewProjectPlan({ parameters: { enabled: true }, parameterPrompt: async (_name, definition) => definition.type === 'boolean' ? true : 'sample' }))
expectType<MonorepoConfig>(defineMonorepoConfig({ commands: { create: { defaultTemplate: 'tsdown', offline: true, cacheDir: '.cache/templates' } } }))
expectNotAssignable<MonorepoConfig>({ commands: { create: { parameters: { enabled: true } } } })
expectNotAssignable<MonorepoConfig>({ commands: { create: { parameterPrompt: async () => true } } })
