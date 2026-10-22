import type { CheckExecutionOptions, CheckExecutionReport, CheckExecutionStatus } from '@icebreakers/monorepo'
import { runCheckWithReport } from '@icebreakers/monorepo'
import { expectAssignable, expectType } from 'tsd'

expectAssignable<CheckExecutionOptions>({ cwd: '.', full: true, signal: new AbortController().signal })
expectType<Promise<CheckExecutionReport>>(runCheckWithReport({ cwd: '.' }))
expectAssignable<CheckExecutionStatus>('interrupted')
