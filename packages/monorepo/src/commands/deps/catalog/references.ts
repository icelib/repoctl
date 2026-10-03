import type { CatalogReference } from '../../../types/catalogs'
import type { DependencyScan } from '../scan'
import { validRange } from 'semver'
import { record } from '../files'
import { parseSpecifier } from '../specifiers'

export function catalogReferences(scan: DependencyScan, catalogs: Map<string, Record<string, string>>): CatalogReference[] {
  const declarations: Array<Omit<CatalogReference, 'catalog' | 'status'>> = scan.occurrences.filter(item => item.protocol === 'catalog')
  for (const [selector, specifier] of Object.entries(record(scan.workspace['overrides']) ?? {})) {
    if (typeof specifier !== 'string' || !specifier.startsWith('catalog:')) {
      continue
    }
    const parsed = /^((?:@[\w.~-]+\/)?[\w.~-]+)(?:@(.+))?$/.exec(selector)
    const name = parsed && (!parsed[2] || !parsed[2].includes('>') || validRange(parsed[2])) ? parsed[1]! : null
    declarations.push({
      name: name ?? selector,
      path: 'pnpm-workspace.yaml',
      workspace: '.',
      packageName: null,
      section: 'overrides',
      specifier,
      ...name ? parseSpecifier(name, specifier, scan.workspace) : { protocol: 'catalog', source: null, range: null },
    })
  }
  return declarations.map((item) => {
    const catalog = item.specifier.slice(8) || 'default'
    const entries = catalogs.get(catalog)
    const unresolved = item.section === 'overrides' && !/^(?:@[\w.~-]+\/)?[\w.~-]+$/.test(item.name)
    const status = !entries ? 'missing_catalog' : unresolved ? 'unresolved_selector' : Object.hasOwn(entries, item.name) ? 'resolved' : 'missing_entry'
    return { ...item, catalog, status }
  })
}
