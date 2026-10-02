import type { ReleasePlan, ReleasePlanOptions } from '..'
import { expectAssignable, expectType } from 'tsd'
import { createReleasePlan } from '..'

expectAssignable<ReleasePlanOptions>({ cwd: '.' })
expectType<Promise<ReleasePlan>>(createReleasePlan({ cwd: '.' }))
