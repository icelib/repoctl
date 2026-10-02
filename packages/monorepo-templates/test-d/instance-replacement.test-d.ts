import type { TemplateInstance, TemplateInstanceDraft, TemplateInstanceReplacementHooks } from '..'
import { expectError, expectType } from 'tsd'
import { normalizeTemplateExclusions, replaceTemplateInstance } from '..'

declare const instance: TemplateInstance
declare const draft: TemplateInstanceDraft
declare const hooks: TemplateInstanceReplacementHooks
expectType<Promise<TemplateInstance>>(replaceTemplateInstance('/workspace', instance, draft, hooks))
expectType<string[]>(normalizeTemplateExclusions(['src/**']))
expectType<string[] | undefined>(instance.excludedPaths)
expectError(normalizeTemplateExclusions('../outside'))
expectError(replaceTemplateInstance('/workspace', instance, draft, { apply: async () => {} }))
