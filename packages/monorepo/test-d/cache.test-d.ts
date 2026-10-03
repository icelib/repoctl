import type { TurboAnalysisOptions, TurboRunAnalysis, TurboTaskAnalysis } from '..'
import { expectAssignable, expectType } from 'tsd'
import { analyzeTurboRuns } from '..'

expectAssignable<TurboAnalysisOptions>({ previous: 'before.json', slowest: 5 })
expectType<Promise<TurboRunAnalysis>>(analyzeTurboRuns('after.json', { previous: 'before.json' }))
expectAssignable<TurboTaskAnalysis['comparison']>('unknown')
