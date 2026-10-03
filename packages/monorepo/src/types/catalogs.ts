import type { DependencyOccurrence, DependencySection } from './dependencies'

export interface CatalogCheckOptions {
  /** Catalog whose direct-version bypasses and migration candidates should be inspected. */
  catalog?: string
}

export interface CatalogMigrationOptions extends CatalogCheckOptions {
  dependency: string
  section: DependencySection
  group?: string
  /** Optional explicit common subrange; never changes an existing catalog entry. */
  to?: string
}

export interface CatalogReference extends Omit<DependencyOccurrence, 'section'> {
  section: DependencySection | 'overrides'
  catalog: string
  status: 'resolved' | 'missing_catalog' | 'missing_entry' | 'unresolved_selector'
}

export interface CatalogEntry {
  catalog: string
  dependency: string
  specifier: string
  status: 'used' | 'unused' | 'usage_unknown'
  consumers: CatalogReference[]
}

export interface CatalogFinding {
  code: 'missing_catalog' | 'missing_entry' | 'unused_entry' | 'uncomparable_entry' | 'direct_declaration' | 'unresolved_selector'
  catalog: string
  dependency: string
  path: string
  section?: DependencySection | 'overrides'
  specifier?: string
}

export interface CatalogMigrationCandidate {
  dependency: string
  section: DependencySection
  group: string
  catalog: string
  status: 'ready' | 'needs_target' | 'blocked' | 'managed'
  reason: 'equivalent_ranges' | 'explicit_narrowing' | 'existing_entry' | 'already_cataloged' | 'peer_range' | 'policy_exception' | 'unsupported_protocol' | 'different_catalog' | 'incompatible_ranges' | 'target_required' | 'existing_entry_conflict' | 'target_not_subset'
  target: string | null
  occurrences: DependencyOccurrence[]
}

export interface CatalogReport {
  schemaVersion: 1
  workspaceDir: string
  catalog: string
  entries: CatalogEntry[]
  references: CatalogReference[]
  findings: CatalogFinding[]
  candidates: CatalogMigrationCandidate[]
  summary: { missing: number, unused: number, uncomparable: number, direct: number, ready: number }
}

export interface CatalogFileChange {
  path: string
  beforeHash: string
  afterHash: string
  /** Exact full-file preview, including workspace YAML comments. */
  before: string
  after: string
}

export interface CatalogMigrationPlan {
  schemaVersion: 1
  kind: 'catalog-migration'
  workspaceDir: string
  selection: { dependency: string, section: DependencySection, group: string, catalog: string, to: string }
  inputs: { path: string, hash: string }[]
  files: CatalogFileChange[]
  consumers: DependencyOccurrence[]
  nextSteps: string[]
}
