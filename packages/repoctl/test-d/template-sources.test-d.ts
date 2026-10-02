import type { ResolvedTemplateSource } from 'repoctl'
import { resolveRemoteTemplateSource } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<ResolvedTemplateSource>>(resolveRemoteTemplateSource({ kind: 'npm', packageName: '@org/templates', version: '1.2.3' }, '.', { cacheDir: './cache' }))
