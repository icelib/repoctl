import type { TurboAnalysisOptions, TurboRunAnalysis, TurboTaskAnalysis } from '@icebreakers/monorepo'
import { analyzeTurboRuns } from '@icebreakers/monorepo'
import { expectAssignable, expectType } from 'tsd'

expectAssignable<TurboAnalysisOptions>({ previous: 'before.json', slowest: 5 })
expectType<Promise<TurboRunAnalysis>>(analyzeTurboRuns('after.json', { previous: 'before.json' }))
expectAssignable<TurboTaskAnalysis['comparison']>('unknown')
