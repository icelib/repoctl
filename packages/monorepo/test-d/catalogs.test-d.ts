import type { CatalogMigrationPlan, CatalogReport, DependencyApplyResult } from '..'
import { expectType } from 'tsd'
import { applyCatalogMigrationPlan, checkCatalogs, planCatalogMigration } from '..'

expectType<Promise<CatalogReport>>(checkCatalogs('.', { catalog: 'legacy' }))
expectType<Promise<CatalogMigrationPlan>>(planCatalogMigration('.', { dependency: 'react', section: 'dependencies', group: 'web', catalog: 'react18', to: '^18' }))
declare const plan: CatalogMigrationPlan
expectType<Promise<DependencyApplyResult>>(applyCatalogMigrationPlan('.', plan))
