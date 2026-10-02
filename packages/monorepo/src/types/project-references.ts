/** Explicit compilation projects, independently of npm dependency relationships. */
export interface ProjectReferencesConfig {
  /** Required for plan application; existing references can always be checked. */
  enabled?: boolean
  /** Existing solution tsconfig, relative to the workspace. @default 'tsconfig.json' */
  root?: string
  /** Workspace-relative config globs; defaults to each package's tsconfig.json. */
  projects?: string[]
  /** Workspace-relative config globs omitted from managed discovery. */
  exclude?: string[]
  /** Explicit compilation edges between discovered configs; no npm edge inference. */
  relations?: Array<{ source: string, target: string }>
}

export interface ProjectReferencesDiagnostic {
  code: 'config' | 'missing' | 'incompatible' | 'cycle' | 'ownership' | 'unselected'
  path: string
  message: string
}

export interface ProjectReferencesOperation {
  path: string
  before: string | null
  after: string
  beforeHash: string | null
  afterHash: string
  diff: string | null
}

export interface ProjectReferencesPlan {
  schemaVersion: 1
  workspaceDir: string
  enabled: boolean
  root: string
  action: 'disabled' | 'blocked' | 'update' | 'unchanged'
  /** Selected configs, excluding manual reference targets. */
  projects: string[]
  diagnostics: ProjectReferencesDiagnostic[]
  operations: ProjectReferencesOperation[]
  /** Fingerprints include configuration, discovery and compiler-read inputs. */
  inputs: Record<string, string>
  validation: Array<{ config: string, cwd: string, command: string[] }>
}

export interface ProjectReferencesCheck {
  schemaVersion: 1
  ok: boolean
  plan: ProjectReferencesPlan
}

export interface ProjectReferencesApplyResult {
  schemaVersion: 1
  changed: string[]
  recoveryFiles: string[]
  validation: ProjectReferencesPlan['validation']
}
