import type { DevContainerOptions, DevContainerPlan, DevContainerResult } from 'repoctl'
import { applyDevContainerPlan, planDevContainer } from 'repoctl'
import { expectAssignable, expectType } from 'tsd'

expectAssignable<DevContainerOptions>({ nodeVersion: '24.22.1' })
expectType<Promise<DevContainerPlan>>(planDevContainer('/workspace'))
declare const plan: DevContainerPlan
expectType<Promise<DevContainerResult>>(applyDevContainerPlan('/workspace', plan))
