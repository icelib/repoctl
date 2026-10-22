import type { AffectedCheckOptions, AffectedCheckPlan, CheckExecutionReport } from '@icebreakers/monorepo'
import { resolveAffectedCheckPlan, runCheckWithReport } from '@icebreakers/monorepo'
import { expectAssignable, expectType } from 'tsd'

expectAssignable<AffectedCheckOptions>({ cwd: '.', base: 'origin/main', head: 'HEAD', filters: ['app'], globalInputs: ['shared/**'] })
expectType<Promise<AffectedCheckPlan>>(resolveAffectedCheckPlan({ cwd: '.' }))
expectType<Promise<CheckExecutionReport>>(runCheckWithReport({ cwd: '.', affected: true, base: 'main', signal: new AbortController().signal }))
declare const report: CheckExecutionReport
expectType<AffectedCheckPlan | undefined>(report.affectedPlan)
