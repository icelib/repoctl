import type { RecommendedCheckMode, RecommendedCheckOptions } from '../check'

export type CheckExecutionStatus = 'success' | 'failed' | 'skipped' | 'interrupted'

export interface CheckExecutionTask {
  name: string
  command: string
  executable: string
  args: string[]
  cwd: string
  status: CheckExecutionStatus
  startedAt: string | null
  endedAt: string | null
  durationMs: number
  exitCode: number | null
  signal: string | null
  reason?: string
  errorCode?: string
}

export interface CheckExecutionReport {
  schemaVersion: 1
  cwd: string
  mode: RecommendedCheckMode
  status: Exclude<CheckExecutionStatus, 'skipped'>
  startedAt: string
  endedAt: string
  durationMs: number
  exitCode: number
  tasks: CheckExecutionTask[]
}

export interface CheckExecutionOptions extends Omit<RecommendedCheckOptions, 'spawn'> {
  /** Abort stops the active child and leaves remaining tasks skipped. */
  signal?: AbortSignal
}
