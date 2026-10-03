export interface PublicApiEntryConfig {
  /** Built declaration path relative to this workspace package. */
  entryPoint: string
  /** Explicit .api.md baseline path relative to the workspace root. */
  baseline: string
}
export interface PublicApiPackageConfig {
  entries: Record<string, PublicApiEntryConfig>
  /** Relative to the workspace package; defaults to tsconfig.json. */
  tsconfig?: string
}
export type PublicApiConfig = Record<string, PublicApiPackageConfig>
export interface PublicApiOptions {
  /** Exact package names or explicit ./workspace paths; defaults to all workspaces. */
  packages?: string[]
  timeoutMs?: number
  signal?: AbortSignal
}
export interface PublicApiDiagnostic {
  code: string
  severity: 'warning' | 'error'
  message: string
  file?: string
  line?: number
}
export interface PublicApiEntryReport {
  workspace: string
  packageName: string | null
  subpath: string
  entryPoint: string
  baseline: string
  status: 'new' | 'changed' | 'unchanged' | 'failed'
  before: string | null
  after: string | null
  /** Fingerprint of the native compiler inputs, for stale-plan detection. */
  inputHash: string | null
  /** Native compiler input digests; paths may reference installed external types. */
  inputs: Array<{ path: string, hash: string }>
  beforeHash: string | null
  afterHash: string | null
  diff: string | null
  diagnostics: PublicApiDiagnostic[]
  changeIntents: string[]
}
export interface PublicApiReport {
  schemaVersion: 1
  kind: 'public-api-report'
  workspaceDir: string
  configurationHash: string
  selection: string[]
  tool: { version: string, moduleHash: string } | null
  status: 'unchanged' | 'changes' | 'failed' | 'skipped'
  entries: PublicApiEntryReport[]
  skipped: Array<{ workspace: string, reason: 'not-configured' }>
  diagnostics: PublicApiDiagnostic[]
  review: string
}
export interface PublicApiUpdatePlan {
  schemaVersion: 1
  kind: 'public-api-update'
  report: PublicApiReport
}
export interface PublicApiUpdateResult {
  status: 'applied' | 'unchanged'
  changed: string[]
}
