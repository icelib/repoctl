import type { WorkspaceDependencyType, WorkspaceGraphEdge } from '../workspace-graph'

export type BoundarySeverity = 'warn' | 'fail'

/** Fields intersect; values within a field are alternatives. */
export interface WorkspaceBoundarySelector {
  /** Exact package names. */
  packages?: string[]
  /** Exact workspace paths, or a directory followed by /**. */
  paths?: string[]
  tags?: string[]
  private?: boolean
}

export interface WorkspaceBoundaryRule {
  id: string
  from: WorkspaceBoundarySelector
  /** Alternatives; an empty list denies all internal dependencies. */
  allow: WorkspaceBoundarySelector[]
  /** Defaults to all four manifest dependency fields. */
  dependencyTypes?: WorkspaceDependencyType[]
  severity?: BoundarySeverity
}

export interface WorkspaceBoundaryException {
  /** A configured rule ID, or the built-in cycle rule. */
  rule: string
  /** Exact workspace-relative directory IDs, including . for root. */
  source: string
  target: string
  type: WorkspaceDependencyType
  reason: string
}

export interface WorkspaceBoundariesConfig {
  tags?: Record<string, Omit<WorkspaceBoundarySelector, 'tags'>>
  rules?: WorkspaceBoundaryRule[]
  /** Defaults to runtime dependencies + optional dependencies, severity fail. */
  cycles?: false | { dependencyTypes?: WorkspaceDependencyType[], severity?: BoundarySeverity }
  exceptions?: WorkspaceBoundaryException[]
}

export interface WorkspaceBoundaryFinding {
  id: 'boundary-rule' | 'boundary-cycle' | 'boundary-config' | 'boundary-selector-unmatched' | 'boundary-graph' | 'boundary-exception-unused'
  status: BoundarySeverity
  detail: string
  rule?: string
  path?: string
  field?: string
  /** Closed representative cycle, or the two endpoints of a violating edge. */
  chain?: string[]
  edges?: WorkspaceGraphEdge[]
  /** All members of the strongly connected component; one finding per component. */
  members?: string[]
}

export interface WorkspaceBoundariesReport {
  schemaVersion: 1
  workspaceDir: string
  configFile: string | null
  packageCount: number
  findings: WorkspaceBoundaryFinding[]
  /** Every waived edge remains visible together with its required reason. */
  exceptions: Array<WorkspaceBoundaryException & { edges: WorkspaceGraphEdge[] }>
  summary: { warn: number, fail: number, waived: number }
}
