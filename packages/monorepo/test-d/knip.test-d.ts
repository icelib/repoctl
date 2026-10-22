import type { KnipCheckPlan, KnipCheckReport, KnipConfigurationSuggestions } from '@icebreakers/monorepo'
import { getKnipConfigurationSuggestions, planKnipCheck, runKnipCheck, saveKnipBaseline } from '@icebreakers/monorepo'
import { expectError, expectType } from 'tsd'

expectType<Promise<KnipCheckPlan>>(planKnipCheck('.', { config: 'knip.ts' }))
expectType<Promise<KnipCheckReport>>(runKnipCheck('.', { baseline: 'knip-baseline.json', newOnly: true }))
expectType<Promise<KnipConfigurationSuggestions>>(getKnipConfigurationSuggestions('.'))
declare const report: KnipCheckReport
expectType<Promise<{ status: 'created' | 'updated' | 'unchanged', path: string, cleanupPending: string[] }>>(saveKnipBaseline('.', report, 'knip-baseline.json'))
expectError(runKnipCheck('.', { fix: true }))
expectError(planKnipCheck('.', { timeoutMs: '1000' }))
