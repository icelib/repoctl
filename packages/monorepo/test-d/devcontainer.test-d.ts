import type { DevContainerOptions, DevContainerPlan, DevContainerResult } from '@icebreakers/monorepo'
import { applyDevContainerPlan, planDevContainer } from '@icebreakers/monorepo'
import { expectAssignable, expectType } from 'tsd'

expectAssignable<DevContainerOptions>({ nodeVersion: '24.21.0' })
expectType<Promise<DevContainerPlan>>(planDevContainer('/workspace'))
declare const plan: DevContainerPlan
expectType<Promise<DevContainerResult>>(applyDevContainerPlan('/workspace', plan))
expectType<'create' | 'unchanged' | 'preserve'>(plan.files[0]!.action)
