import type { CreateNewProjectPlan } from '@icebreakers/monorepo'
import { applyCreateNewProjectPlan, resolveCreateNewProjectPlan } from '@icebreakers/monorepo'
import { expectError, expectType } from 'tsd'

declare const plan: CreateNewProjectPlan
expectType<Promise<CreateNewProjectPlan>>(resolveCreateNewProjectPlan({ parameters: { enabled: true, name: 'sample' }, parameterPrompt: async (_name, definition) => definition.type === 'boolean' ? true : 'sample' }))
expectType<Promise<void>>(applyCreateNewProjectPlan(plan))
expectType<string | boolean | undefined>(plan.parameterization?.values['name'])
expectError(resolveCreateNewProjectPlan({ parameters: { count: 1 } }))
expectError(resolveCreateNewProjectPlan({ parameterPrompt: async () => 123 }))
