export interface KnipCheckOptions {
  /** Native Knip config path, relative to cwd when supplied. */
  config?: string
  /** Baseline path relative to the workspace root. */
  baseline?: string
  newOnly?: boolean
  production?: boolean
  /** Native Knip strict mode also enables its production analysis. */
  strict?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

export interface KnipCheckPlan {
  schemaVersion: 1
  kind: 'knip-check'
  workspaceDir: string
  status: 'ready' | 'missing_tool' | 'unsupported_tool'
  tool: { name: 'knip', version: string | null, supported: '>=6.39.0 <7', entry: string | null }
  executable: string
  args: string[]
  config: string | null
  baseline: string | null
  newOnly: boolean
  production: boolean
  strict: boolean
  timeoutMs: number
  guidance: string[]
}

export interface KnipFinding {
  fingerprint: string
  type: string
  severity: 'error' | 'warn'
  /** Relative directory of the containing native Knip workspace. */
  workspace: string
  file: string
  symbol: string
  line?: number
  column?: number
  /** Original Knip fields, excluding edit instructions. */
  native: Record<string, unknown>
}

export interface KnipAnalysisScope {
  toolVersion: string
  production: boolean
  strict: boolean
  rootName: string | null
  workspaces: string[]
  configuration: { path: string, hash: string }[]
  configFile: string | null
  report: Record<string, boolean>
  plugins: Record<string, string[]>
}

export interface KnipBaseline {
  schemaVersion: 1
  kind: 'knip-baseline'
  scope: KnipAnalysisScope
  findings: KnipFinding[]
}

export interface KnipBaselineSaveResult {
  status: 'created' | 'updated' | 'unchanged'
  path: string
  cleanupPending: string[]
}

export interface KnipBaselineComparison {
  status: 'none' | 'valid' | 'invalid'
  path: string | null
  reason?: string
  existing: KnipFinding[]
  added: KnipFinding[]
  fixed: KnipFinding[]
}

export interface KnipCheckReport {
  schemaVersion: 1
  kind: 'knip-report'
  workspaceDir: string
  status: 'completed' | 'failed'
  /** 0: policy passes; 1: findings; 2: incomplete analysis or invalid baseline. */
  exitCode: number
  nativeExitCode: number | null
  plan: KnipCheckPlan
  scope: KnipAnalysisScope | null
  findings: KnipFinding[]
  summary: { errors: number, warnings: number, byType: Record<string, { errors: number, warnings: number }> }
  baseline: KnipBaselineComparison
  diagnostics: { code: string, message: string }[]
}

export interface KnipConfigurationSuggestions {
  schemaVersion: 1
  workspaceDir: string
  existing: string[]
  /** Native Knip configuration to merge manually; never written automatically. */
  suggested: Record<string, unknown>
  guidance: { key: string, reason: string }[]
}
