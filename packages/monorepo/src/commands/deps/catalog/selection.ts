import type { CatalogMigrationCandidate, CatalogMigrationOptions } from '../../../types/catalogs'
import type { DependencyConsistencyGroup } from '../../../types/dependencies'
import type { DependencyScan } from '../scan'
import { satisfies, subset, valid } from 'semver'
import { equivalentRanges, parseSpecifier, rangesOverlap } from '../specifiers'
import { catalogEntry, catalogName, readCatalogs } from './config'

export function migrationCandidate(scan: DependencyScan, group: DependencyConsistencyGroup, options: Pick<CatalogMigrationOptions, 'catalog' | 'to'>): CatalogMigrationCandidate {
  const catalog = catalogName(options.catalog)
  const current = catalogEntry(readCatalogs(scan.workspace), catalog, group.dependency)
  const result: CatalogMigrationCandidate = {
    dependency: group.dependency,
    section: group.section,
    group: group.group,
    catalog,
    status: 'blocked',
    reason: 'unsupported_protocol',
    target: null,
    occurrences: group.occurrences,
  }
  const stop = (reason: CatalogMigrationCandidate['reason']) => ({ ...result, reason })
  if (group.status === 'exception') {
    return stop('policy_exception')
  }
  if (group.occurrences.some(item => item.protocol === 'catalog' && (item.specifier.slice(8) || 'default') !== catalog)) {
    return stop('different_catalog')
  }
  if (options.to !== undefined && current !== undefined && options.to !== current) {
    return stop('existing_entry_conflict')
  }
  if (group.occurrences.every(item => item.protocol === 'catalog') && current !== undefined) {
    return { ...result, status: 'managed', reason: 'already_cataloged', target: current }
  }
  if (group.section === 'peerDependencies') {
    return stop('peer_range')
  }
  if (group.occurrences.some(item => !['semver', 'npm', 'catalog'].includes(item.protocol) || !item.range || !item.source)
    || new Set(group.occurrences.map(item => item.source)).size !== 1) {
    return stop('unsupported_protocol')
  }
  const ranges = group.occurrences.map(item => item.range!)
  if (rangesOverlap(ranges) !== true) {
    return stop('incompatible_ranges')
  }
  const target = options.to ?? current ?? (equivalentRanges(ranges) ? group.occurrences[0]!.specifier : undefined)
  if (!target) {
    return { ...result, status: 'needs_target', reason: 'target_required' }
  }
  const parsed = parseSpecifier(group.dependency, target)
  if (!['semver', 'npm'].includes(parsed.protocol) || !parsed.range
    || group.occurrences.some(item => item.source !== parsed.source || (item.protocol !== 'catalog' && item.protocol !== parsed.protocol))) {
    return stop('unsupported_protocol')
  }
  const version = valid(parsed.range)
  if (ranges.some(range => !(version ? satisfies(version, range) : subset(parsed.range!, range)))) {
    return stop(current !== undefined ? 'existing_entry_conflict' : 'target_not_subset')
  }
  return { ...result, status: 'ready', reason: current !== undefined ? 'existing_entry' : options.to !== undefined ? 'explicit_narrowing' : 'equivalent_ranges', target }
}
