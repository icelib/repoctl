import type { DoctorCommandConfig, DoctorFixPlan, DoctorFixResult, DoctorOptions, DoctorReport, DoctorSuppression } from '@icebreakers/monorepo'
import { applyDoctorFixPlan, defineMonorepoConfig, getDoctorRuleIds, planDoctorFix, runDoctor } from '@icebreakers/monorepo'
import { expectAssignable, expectError, expectType } from 'tsd'

const suppression: DoctorSuppression = { id: 'root-scripts', reason: 'Migration', expires: '2026-12-31' }
expectAssignable<DoctorOptions>({ rules: ['root-scripts'], suppressions: [suppression] })
expectAssignable<DoctorCommandConfig>({ suppressions: [suppression] })
expectError<DoctorSuppression>({ id: 'root-scripts' })
expectError(runDoctor('.', { rules: 'root-scripts' }))
expectType<string[]>(getDoctorRuleIds())
expectAssignable<Promise<DoctorReport>>(runDoctor('.', { rules: ['root-scripts'] }))
expectType<Promise<DoctorFixPlan>>(planDoctorFix('.'))
declare const plan: DoctorFixPlan
expectType<Promise<DoctorFixResult>>(applyDoctorFixPlan('.', plan))
defineMonorepoConfig({ commands: { doctor: { rules: [], suppressions: [suppression] } } })
