export interface EnvCacheSuppression {
  rule: string
  reason: string
  package?: string
  task?: string
  variable?: string
  path?: string
}

export interface EnvCacheConfig {
  /** Build is checked by default; task reachability is not inferred from source code. */
  tasks?: string[]
  include?: string[]
  exclude?: string[]
  frameworkInference?: boolean
  suppressions?: EnvCacheSuppression[]
}

export interface EnvCacheOptions {
  tasks?: string[]
  frameworkInference?: boolean
}

export interface EnvCacheEvidence {
  path: string
  line: number
  column: number
  kind: 'process-env' | 'import-meta-env' | 'example' | 'dynamic'
}

export interface EnvCacheVariable {
  name: string
  coverage: 'hash' | 'passthrough' | 'inferred' | 'builtin' | 'missing' | 'unknown'
  evidence: EnvCacheEvidence[]
  declarations: Array<{ path: string, field: string, pattern: string }>
}

export interface EnvCacheFinding {
  rule: string
  severity: 'info' | 'warn' | 'fail'
  package: string
  task: string | null
  variable: string | null
  path: string | null
  line: number | null
  message: string
  suppression?: { reason: string, index: number }
}

export interface EnvCacheTask {
  package: string
  path: string
  task: string
  cache: boolean | null
  variables: EnvCacheVariable[]
  dynamic: EnvCacheEvidence[]
  files: Array<{ path: string, coverage: 'global' | 'task' | 'default' | 'missing' | 'unknown' }>
}

export interface EnvCacheReport {
  schemaVersion: 1
  kind: 'environment-cache-check'
  status: 'pass' | 'warn' | 'fail'
  tasks: EnvCacheTask[]
  findings: EnvCacheFinding[]
  summary: { info: number, warn: number, fail: number, suppressed: number }
  limitations: string[]
}
