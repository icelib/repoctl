import type { CatalogCheckOptions, CatalogMigrationOptions } from '../../../types/catalogs'
import { scanDependencies } from '../scan'
import { prepareCatalogMigration } from './plan'
import { catalogReport } from './report'

export async function checkCatalogs(cwd: string, options: CatalogCheckOptions = {}) {
  return catalogReport(await scanDependencies(cwd), options)
}

export async function planCatalogMigration(cwd: string, options: CatalogMigrationOptions) {
  return prepareCatalogMigration(await scanDependencies(cwd), options).plan
}

export { applyCatalogMigrationPlan } from './apply'
