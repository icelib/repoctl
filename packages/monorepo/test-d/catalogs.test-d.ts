import type { CatalogMigrationPlan, CatalogReport, DependencyApplyResult } from '@icebreakers/monorepo'
import { applyCatalogMigrationPlan, checkCatalogs, planCatalogMigration } from '@icebreakers/monorepo'
import { expectType } from 'tsd'

expectType<Promise<CatalogReport>>(checkCatalogs('.', { catalog: 'legacy' }))
expectType<Promise<CatalogMigrationPlan>>(planCatalogMigration('.', { dependency: 'react', section: 'dependencies', group: 'web', catalog: 'react18', to: '^18' }))
declare const plan: CatalogMigrationPlan
expectType<Promise<DependencyApplyResult>>(applyCatalogMigrationPlan('.', plan))
