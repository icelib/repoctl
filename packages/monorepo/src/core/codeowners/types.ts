export interface CodeownersConfig {
  /** Exact package names or workspace-relative directory paths. */
  owners: Record<string, string[]>
}

export interface CodeownersDiagnostic {
  code: 'INVALID_CONFIG' | 'INVALID_OWNER' | 'UNKNOWN_WORKSPACE' | 'AMBIGUOUS_WORKSPACE' | 'MISSING_OWNER' | 'UNSUPPORTED_PATH' | 'INVALID_MARKERS' | 'POSSIBLE_SHADOW' | 'INACTIVE_FILE'
  severity: 'error' | 'warning'
  message: string
  source: string
  line?: number
}

export interface WorkspaceOwnership {
  path: string
  name?: string
  private: boolean
  owners: string[]
  sources: string[]
}

export interface CodeownersReport {
  schemaVersion: 1
  workspaceDir: string
  configFile: string | null
  configFiles: string[]
  packages: WorkspaceOwnership[]
  diagnostics: CodeownersDiagnostic[]
}

export interface CodeownersPlan extends CodeownersReport {
  file: string
  before: string | null
  after: string
  diff: string
  changed: boolean
  /** Hashes cover workspace discovery, package metadata, and config candidates. */
  inputs: Record<string, string | null>
}

export interface CodeownersOptions {
  cwd: string
  query?: string
}
