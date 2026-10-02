import type { TemplateInstanceInfo, TemplateLinkPlan } from '..'
import { expectError, expectType } from 'tsd'
import { applyTemplateLinkPlan, listTemplateInstances, planTemplateLink, rebuildTemplateInstanceBaseline } from '..'

expectType<Promise<TemplateInstanceInfo[]>>(listTemplateInstances('/workspace'))
expectType<Promise<TemplateLinkPlan>>(planTemplateLink({ cwd: '/workspace', target: 'packages/library', template: 'tsdown', version: '2.1.0' }))
declare const plan: TemplateLinkPlan
expectType<'available' | 'unverified'>(plan.baselineStatus)
expectType<'register' | 'verify' | 'unchanged' | 'conflict'>(plan.action)
applyTemplateLinkPlan(plan).then(result => expectType<boolean>(result.applied))
rebuildTemplateInstanceBaseline('/workspace', 'instance-id', '/isolated').then(result => expectType<string>(result.id))
expectError(planTemplateLink({ cwd: '/workspace', target: 'packages/library', template: 'tsdown', version: '2.1.0', parameters: { token: 'secret' } }))
expectError(planTemplateLink({ cwd: '/workspace', target: 'packages/library', template: 'tsdown', version: 'latest', profile: 'unknown' }))
