import type { CatalogMigrationPlan, CatalogReport } from 'repoctl'
import { checkCatalogs, planCatalogMigration } from 'repoctl'
import { expectType } from 'tsd'

expectType<Promise<CatalogReport>>(checkCatalogs('.'))
expectType<Promise<CatalogMigrationPlan>>(planCatalogMigration('.', { dependency: 'vue', section: 'devDependencies' }))
