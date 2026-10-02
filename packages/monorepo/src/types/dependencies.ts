export type DependencySection = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'

/** An intentional version cohort, selected by exact workspace-relative directories. */
export interface DependencyVersionGroup {
  name: string
  workspaces: string[]
  dependencies: string[]
  sections?: DependencySection[]
  reason: string
  /** Report these declarations as an explicit exception; never include them in fixes. */
  ignore?: boolean
}

export interface DependenciesCommandConfig {
  groups?: DependencyVersionGroup[]
}

export type DependencyProtocol = 'semver' | 'npm' | 'catalog' | 'workspace' | 'file' | 'link' | 'git' | 'url' | 'unknown'
export type DependencyGroupStatus = 'consistent' | 'equivalent' | 'compatible' | 'conflict' | 'uncomparable' | 'managed' | 'exception'

export interface DependencyOccurrence {
  name: string
  section: DependencySection
  workspace: string
  path: string
  packageName: string | null
  specifier: string
  protocol: DependencyProtocol
  source: string | null
  range: string | null
}

export interface DependencyConsistencyGroup {
  dependency: string
  section: DependencySection
  group: string
  reason: string | null
  status: DependencyGroupStatus
  detail: string
  occurrences: DependencyOccurrence[]
}

export interface DependencyReport {
  schemaVersion: 1
  workspaceDir: string
  groups: DependencyConsistencyGroup[]
  summary: Record<DependencyGroupStatus, number>
}

export interface DependencyFixOptions {
  dependency: string
  section: DependencySection
  /** The default cohort is named "default". */
  group?: string
  /** Explicit semver range, or npm alias with the same source package. */
  to: string
}

export interface DependencyFileChange {
  path: string
  beforeHash: string
  afterHash: string
  section: DependencySection
  dependency: string
  before: string
  after: string
}

/** Serializable preview. Apply checks every input and regenerates the proposed changes. */
export interface DependencyFixPlan {
  schemaVersion: 1
  workspaceDir: string
  selection: Required<DependencyFixOptions>
  inputs: { path: string, hash: string }[]
  files: DependencyFileChange[]
  nextSteps: string[]
}

export interface DependencyApplyResult {
  status: 'applied' | 'unchanged'
  changed: string[]
  nextSteps: string[]
}
