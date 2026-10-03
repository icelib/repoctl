import type { CatalogMigrationOptions, CatalogMigrationPlan } from '../../../types/catalogs'
import type { DependencyScan } from '../scan'
import { hash, updateManifest } from '../files'
import { dependencyNextSteps } from '../plan'
import { dependencySections } from '../policy'
import { dependencyReport } from '../report'
import { addCatalogEntry, catalogName, readCatalogs } from './config'
import { migrationCandidate } from './selection'

export function prepareCatalogMigration(scan: DependencyScan, options: CatalogMigrationOptions) {
  if (!options || typeof options.dependency !== 'string' || !options.dependency.trim()
    || !dependencySections.includes(options.section)
    || (options.group !== undefined && (typeof options.group !== 'string' || !options.group))
    || (options.to !== undefined && (typeof options.to !== 'string' || !options.to.trim()))) {
    throw new Error('Select a dependency, dependency section and optional explicit catalog target.')
  }
  const catalog = catalogName(options.catalog)
  const group = dependencyReport(scan).groups.find(item => item.dependency === options.dependency && item.section === options.section && item.group === (options.group ?? 'default'))
  if (!group) {
    throw new Error('No dependency declarations match this catalog migration selection.')
  }
  const candidate = migrationCandidate(scan, group, options)
  if (!['ready', 'managed'].includes(candidate.status) || candidate.target === null) {
    throw new Error(`Catalog migration requires review: ${candidate.reason}. Choose an intentional version group/named catalog, provide a common --to subrange, or keep the declarations unchanged.`)
  }
  const selection = { dependency: options.dependency, section: options.section, group: options.group ?? 'default', catalog, to: candidate.target }
  const updates = group.occurrences.filter(item => item.protocol !== 'catalog').map((item) => {
    const original = scan.contents.get(item.path)!
    const reference = catalog === 'default' ? 'catalog:' : `catalog:${catalog}`
    return { path: item.path, original, content: updateManifest(original, item.section, item.name, reference) }
  })
  if (updates.length && !Object.hasOwn(readCatalogs(scan.workspace).get(catalog) ?? {}, selection.dependency)) {
    const original = scan.contents.get('pnpm-workspace.yaml')!
    updates.push({ path: 'pnpm-workspace.yaml', original, content: addCatalogEntry(original, catalog, selection.dependency, selection.to) })
  }
  const plan: CatalogMigrationPlan = {
    schemaVersion: 1,
    kind: 'catalog-migration',
    workspaceDir: scan.workspaceDir,
    selection,
    inputs: scan.inputs,
    files: updates.map(item => ({ path: item.path, beforeHash: hash(item.original), afterHash: hash(item.content), before: item.original, after: item.content })),
    consumers: group.occurrences,
    nextSteps: [...dependencyNextSteps],
  }
  return { plan, updates }
}
