import type { ToolingCapability, ToolingCapabilityPlan, ToolingCapabilityResult } from '@icebreakers/monorepo'
import { applyToolingCapability, listToolingCapabilities, planToolingCapability } from '@icebreakers/monorepo'
import { expectType } from 'tsd'

expectType<ToolingCapability[]>(listToolingCapabilities())
const promise = planToolingCapability('.', { capability: 'playwright', target: 'web', interaction: { route: '/', click: { testId: 'increment' }, expectText: '1' } })
expectType<Promise<ToolingCapabilityPlan>>(promise)
declare const plan: ToolingCapabilityPlan
expectType<Promise<ToolingCapabilityResult>>(applyToolingCapability(plan))

expectType<Promise<ToolingCapabilityPlan>>(planToolingCapability('.', { capability: 'storybook', target: 'ui', framework: 'vue', component: 'Button', example: { kind: 'prop-update', prop: 'label', initial: 'First', updated: 'Second' } }))
