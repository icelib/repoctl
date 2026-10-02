import type { CheckExecutionOptions, CheckExecutionReport, CheckExecutionStatus } from '..'
import { expectAssignable, expectType } from 'tsd'
import { runCheckWithReport } from '..'

expectAssignable<CheckExecutionOptions>({ cwd: '.', full: true, signal: new AbortController().signal })
expectType<Promise<CheckExecutionReport>>(runCheckWithReport({ cwd: '.' }))
expectAssignable<CheckExecutionStatus>('interrupted')
