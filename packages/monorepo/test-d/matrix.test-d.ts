import type { AffectedCheckMatrix, AffectedCheckMatrixJob, AffectedCheckMatrixOptions } from '..'
import { expectAssignable, expectType } from 'tsd'
import { resolveAffectedCheckMatrix } from '..'

expectAssignable<AffectedCheckMatrixOptions>({ cwd: '.', base: 'main', filters: ['app'], shards: 2 })
expectType<Promise<AffectedCheckMatrix>>(resolveAffectedCheckMatrix({ cwd: '.' }))
declare const matrix: AffectedCheckMatrix
expectType<boolean>(matrix.hasWork)
expectType<AffectedCheckMatrixJob[]>(matrix.matrix.include)
expectType<string[]>(matrix.matrix.include[0]!.commands[0]!.args)
