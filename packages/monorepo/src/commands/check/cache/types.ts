export interface TurboAnalysisOptions {
  previous?: string
  /** Maximum slow tasks to show; 1–100, defaults to 10. */
  slowest?: number
}

export interface TurboAnalysisLimitation {
  code: string
  summary: 'current' | 'previous'
  taskId?: string
  field?: string
}

export interface TurboHashEvidence {
  category: 'input' | 'global-input' | 'environment' | 'configuration' | 'dependency' | 'task-hash'
  field: string
  change: 'added' | 'removed' | 'changed' | 'unknown'
  /** SHA-256 of canonical evidence, never an untrusted raw hash or environment value. */
  beforeDigest: string | null
  afterDigest: string | null
}

export interface TurboTaskAnalysis {
  taskId: string
  cache: 'hit' | 'miss' | 'unknown'
  durationMs: number | null
  exitCode: number | null
  hashDigest: string | null
  comparison: 'not-requested' | 'added' | 'removed' | 'changed' | 'unchanged' | 'unknown'
  previousDurationMs: number | null
  durationDeltaMs: number | null
  evidence: TurboHashEvidence[]
}

export interface TurboCriticalPath {
  available: boolean
  reason: 'complete' | 'unsupported-schema' | 'missing-timing' | 'missing-dependencies' | 'dependency-cycle' | 'overlapping-dependency' | 'ambiguous-tasks' | 'no-tasks' | 'timing-overflow'
  taskIds: string[]
  /** Sum of recorded durations along the longest dependency chain, excluding scheduling gaps. */
  durationMs: number | null
  observedSpanMs: number | null
}

export interface TurboRunAnalysis {
  schemaVersion: 1
  kind: 'turbo-cache-analysis'
  current: { supportedSchema: boolean, turboVersion: string | null }
  previous: { supportedSchema: boolean, turboVersion: string | null } | null
  totals: { tasks: number, hits: number, misses: number, unknownCache: number, hitRate: number | null }
  tasks: TurboTaskAnalysis[]
  /** Shared global differences apply to every task and are stored only once. */
  globalEvidence: TurboHashEvidence[]
  slowest: Array<{ taskId: string, durationMs: number }>
  criticalPath: TurboCriticalPath
  limitations: TurboAnalysisLimitation[]
}

/** Internal records retain only allowlisted, digested evidence after parsing. */
export interface ParsedTurboTask {
  id: string
  cache: TurboTaskAnalysis['cache']
  duration: number | null
  start: number | null
  end: number | null
  exitCode: number | null
  hash: string | null
  dependencies: string[] | null
  evidence: Map<string, { category: TurboHashEvidence['category'], digest: string }>
  completeGroups: Set<string>
}

export interface ParsedTurboSummary {
  supported: boolean
  turboVersion: string | null
  tasks: Map<string, ParsedTurboTask>
  ambiguous: boolean
  globalEvidence: ParsedTurboTask['evidence']
  completeGroups: Set<string>
  limitations: TurboAnalysisLimitation[]
}
