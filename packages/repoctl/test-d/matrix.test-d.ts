import type { AffectedCheckMatrix } from 'repoctl'
import { resolveAffectedCheckMatrix } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<AffectedCheckMatrix>>(resolveAffectedCheckMatrix({ cwd: '.', base: 'main', shards: 4 }))
