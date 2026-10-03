import type { DoctorReport } from '../types'

export interface DoctorScriptAddition {
  name: string
  command: string
}

export interface DoctorFixOperation {
  id: 'add-missing-root-scripts'
  rule: 'root-scripts'
  risk: 'low'
  path: 'package.json'
  before: string
  beforeHash: string
  after: string
  afterHash: string
  additions: DoctorScriptAddition[]
  diff: string
}

/** Reviewable versioned data; applying never interprets diagnostic fix prose. */
export interface DoctorFixPlan {
  schemaVersion: 1
  workspaceDir: string
  operations: DoctorFixOperation[]
  notes: string[]
}

export interface DoctorFixResult {
  status: 'applied' | 'unchanged'
  changed: string[]
  verification: DoctorReport
}
