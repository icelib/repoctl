import type { TemplateCatalog, TemplateCatalogEntry } from 'repoctl'
import { resolveTemplateCatalog } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<TemplateCatalog>>(resolveTemplateCatalog({ cwd: '.' }))
expectType<string>((null as unknown as TemplateCatalogEntry).sourceDir)
