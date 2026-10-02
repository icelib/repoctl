import type { GetWorkspacePackagesOptions } from '../../types/workspace'

export type WorkspaceDependencyType = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'

export interface WorkspaceGraphNode {
  /** Stable workspace-relative directory; names need not be unique. */
  id: string
  name?: string
  version?: string
  private: boolean
}

export interface WorkspaceGraphEdge {
  /** Consumer node ID. */
  source: string
  /** Dependency node ID. */
  target: string
  type: WorkspaceDependencyType
  /** Manifest key, which can be an alias of the target name. */
  dependency: string
  specifier: string
  /** semver denotes a matching local candidate, not lockfile installation proof. */
  resolution: 'workspace' | 'local' | 'semver'
}

export interface WorkspaceGraphDiagnostic {
  code: 'duplicate_name' | 'unresolved_dependency' | 'ambiguous_dependency' | 'incompatible_version' | 'invalid_specifier' | 'unresolved_specifier'
  source?: string
  dependency: string
  type?: WorkspaceDependencyType
  specifier?: string
  candidates: string[]
}

export interface WorkspaceGraphFilter {
  /** Exact names or workspace-relative directories; selected nodes and incident edges. */
  packages?: string[]
  dependencyTypes?: WorkspaceDependencyType[]
}

export interface WorkspaceGraphOptions extends GetWorkspacePackagesOptions, WorkspaceGraphFilter {}

export interface WorkspaceGraph {
  schemaVersion: 1
  cwd: string
  workspaceDir: string
  dependencyTypes: WorkspaceDependencyType[]
  nodes: WorkspaceGraphNode[]
  edges: WorkspaceGraphEdge[]
  diagnostics: WorkspaceGraphDiagnostic[]
}

export interface WorkspaceWhyResult {
  schemaVersion: 1
  from: string
  to: string
  found: boolean
  /** One deterministic shortest path of node IDs, including both endpoints. */
  path: string[]
  edges: WorkspaceGraphEdge[]
  dependencyTypes: WorkspaceDependencyType[]
  diagnostics: WorkspaceGraphDiagnostic[]
}

export interface WorkspaceImpactOptions {
  direct?: boolean
  dependencyTypes?: WorkspaceDependencyType[]
}

export interface WorkspaceImpactResult {
  schemaVersion: 1
  target: string
  directOnly: boolean
  dependencyTypes: WorkspaceDependencyType[]
  consumers: Array<{
    id: string
    /** Minimum number of dependency edges from this consumer to the target. */
    distance: number
    direct: boolean
    path: string[]
  }>
  diagnostics: WorkspaceGraphDiagnostic[]
}
