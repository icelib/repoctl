import type { ReleasePlan, ReleasePlanOptions } from '@icebreakers/monorepo'
import { createReleasePlan } from '@icebreakers/monorepo'
import { expectAssignable, expectType } from 'tsd'

expectAssignable<ReleasePlanOptions>({ cwd: '.' })
expectType<Promise<ReleasePlan>>(createReleasePlan({ cwd: '.' }))
