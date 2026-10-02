export interface WorkspaceTask {
  name: string
  command: string
  invocation: { executable: 'pnpm', args: string[] }
}

export interface WorkspaceTaskPackage {
  id: string
  name?: string
  description?: string
  directory: string
  private: boolean
  root: boolean
  tasks: WorkspaceTask[]
}

export interface WorkspaceTaskOptions {
  /** Literal case-insensitive search across names, paths, descriptions and task names. */
  query?: string
  /** Exact script name. Packages without this script are listed as excluded. */
  script?: string
  includePrivate?: boolean
  includeRoot?: boolean
}

export interface WorkspaceTaskCatalog {
  schemaVersion: 1
  workspaceDir: string
  packages: WorkspaceTaskPackage[]
  excluded: Array<{ id: string, reason: 'private_package' | 'root_package' | 'query_mismatch' | 'missing_script' }>
}

export interface WorkspaceLocation {
  schemaVersion: 1
  workspaceDir: string
  query: string
  status: 'found' | 'ambiguous' | 'not_found'
  candidates: WorkspaceTaskPackage[]
}
