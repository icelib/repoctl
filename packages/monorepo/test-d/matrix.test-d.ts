import type { AffectedCheckMatrix, AffectedCheckMatrixJob, AffectedCheckMatrixOptions } from '@icebreakers/monorepo'
import { resolveAffectedCheckMatrix } from '@icebreakers/monorepo'
import { expectAssignable, expectType } from 'tsd'

expectAssignable<AffectedCheckMatrixOptions>({ cwd: '.', base: 'main', filters: ['app'], shards: 2 })
expectType<Promise<AffectedCheckMatrix>>(resolveAffectedCheckMatrix({ cwd: '.' }))
declare const matrix: AffectedCheckMatrix
expectType<boolean>(matrix.hasWork)
expectType<AffectedCheckMatrixJob[]>(matrix.matrix.include)
expectType<string[]>(matrix.matrix.include[0]!.commands[0]!.args)
