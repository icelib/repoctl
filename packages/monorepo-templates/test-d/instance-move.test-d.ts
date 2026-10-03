import type { TemplateInstance, TemplateInstanceDraft, TemplateInstanceMovePlan, TemplateInstanceRegistrationOptions, TemplateInstanceReplacementHooks } from '..'
import { expectError, expectType } from 'tsd'
import { moveTemplateInstances, planTemplateInstanceMove, registerTemplateInstances } from '..'

declare const plan: TemplateInstanceMovePlan
declare const hooks: TemplateInstanceReplacementHooks
expectType<Promise<TemplateInstanceMovePlan>>(planTemplateInstanceMove('/workspace', 'packages/old', 'libs/new'))
expectType<Promise<string[]>>(moveTemplateInstances('/workspace', plan, hooks))
expectType<Promise<string[]>>(moveTemplateInstances('/workspace', plan, hooks, true))
expectError(moveTemplateInstances('/workspace', plan, { apply: async () => {} }))
expectError(planTemplateInstanceMove('/workspace', 'packages/old', false))
declare const draft: TemplateInstanceDraft
declare const options: TemplateInstanceRegistrationOptions
expectType<Promise<TemplateInstance[]>>(registerTemplateInstances('/workspace', [draft], undefined, options))
expectError(registerTemplateInstances('/workspace', [draft], undefined, { allocateIdOnConflict: 'yes' }))
