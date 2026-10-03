import type { CatalogCheckOptions, CatalogEntry, CatalogFinding, CatalogReport } from '../../../types/catalogs'
import type { DependencyScan } from '../scan'
import { dependencyReport } from '../report'
import { parseSpecifier } from '../specifiers'
import { catalogName, readCatalogs } from './config'
import { catalogReferences } from './references'
import { migrationCandidate } from './selection'

export function catalogReport(scan: DependencyScan, options: CatalogCheckOptions = {}): CatalogReport {
  const catalog = catalogName(options.catalog)
  const catalogs = readCatalogs(scan.workspace)
  const findings: CatalogFinding[] = []
  const references = catalogReferences(scan, catalogs)
  for (const item of references) {
    if (item.status !== 'resolved') {
      findings.push({ code: item.status, catalog: item.catalog, dependency: item.name, path: item.path, section: item.section, specifier: item.specifier })
    }
  }
  const entries: CatalogEntry[] = []
  for (const [name, values] of catalogs) {
    for (const [dependency, specifier] of Object.entries(values).sort(([a], [b]) => a.localeCompare(b))) {
      const consumers = references.filter(item => item.catalog === name && item.name === dependency && item.status === 'resolved')
      const uncertain = references.some(item => item.catalog === name && item.status === 'unresolved_selector')
      entries.push({ catalog: name, dependency, specifier, status: consumers.length ? 'used' : uncertain ? 'usage_unknown' : 'unused', consumers })
      if (!consumers.length && !uncertain) {
        findings.push({ code: 'unused_entry', catalog: name, dependency, path: 'pnpm-workspace.yaml', specifier })
      }
      const parsed = parseSpecifier(dependency, specifier)
      if (!['semver', 'npm'].includes(parsed.protocol) || !parsed.range) {
        findings.push({ code: 'uncomparable_entry', catalog: name, dependency, path: 'pnpm-workspace.yaml', specifier })
      }
    }
  }
  const candidates = dependencyReport(scan).groups.map(group => migrationCandidate(scan, group, { catalog }))
  for (const candidate of candidates) {
    if (['peer_range', 'policy_exception'].includes(candidate.reason)) {
      continue
    }
    for (const item of candidate.occurrences) {
      if (['semver', 'npm'].includes(item.protocol) && Object.hasOwn(catalogs.get(catalog) ?? {}, item.name)) {
        findings.push({ code: 'direct_declaration', catalog, dependency: item.name, path: item.path, section: item.section, specifier: item.specifier })
      }
    }
  }
  return {
    schemaVersion: 1,
    workspaceDir: scan.workspaceDir,
    catalog,
    entries,
    references,
    findings,
    candidates,
    summary: {
      missing: references.filter(item => item.status === 'missing_catalog' || item.status === 'missing_entry').length,
      unused: entries.filter(item => item.status === 'unused').length,
      uncomparable: findings.filter(item => item.code === 'uncomparable_entry').length,
      direct: findings.filter(item => item.code === 'direct_declaration').length,
      ready: candidates.filter(item => item.status === 'ready').length,
    },
  }
}
