import type { TemplateInstanceSource } from '@icebreakers/monorepo-templates'
import type { DoctorSuppression } from '../../types/doctor'
import type { DoctorCheck, DoctorSummary, DoctorSuppressionReport } from '../doctor/types'

export interface TemplateDriftOptions {
  /** Compare with metadata from an explicitly supplied extracted template package. */
  sourceDir?: string
  /** Explicitly query the public npm registry's latest dist-tag; defaults to offline. */
  remote?: boolean
  suppressions?: DoctorSuppression[]
}

export interface TemplateVersionEvidence {
  kind: 'installed' | 'extracted' | 'remote'
  status: 'available' | 'unavailable'
  package: string
  version?: string
  detail: string
}

export interface TemplateVersionComparison {
  status: 'newer' | 'same' | 'ahead' | 'unknown'
  currentVersion?: string
  comparedVersion?: string
  detail: string
}

export interface TemplateDriftFile {
  /** Workspace-relative path. File contents are never included in reports. */
  path: string
  state: 'unchanged' | 'modified' | 'deleted' | 'excluded' | 'unavailable'
  baselineHash?: string
  currentHash?: string
  detail?: string
}

export interface TemplateDriftOwner {
  kind: 'instance' | 'root-asset'
  id: string
  path: string
  template?: string
  source: TemplateInstanceSource
  baseline: { status: 'available' | 'unverified' | 'unavailable', detail: string }
  version: TemplateVersionComparison
  local: 'unchanged' | 'drifted' | 'unknown' | 'excluded'
  files: TemplateDriftFile[]
  recommendations: string[]
}

export interface TemplateDriftRegistry {
  status: 'available' | 'absent' | 'unavailable'
  path: string
  detail: string
}

export interface TemplateDriftCollection {
  schemaVersion: 1
  workspaceDir: string
  evidence: TemplateVersionEvidence
  instanceRegistry: TemplateDriftRegistry
  rootRegistry: TemplateDriftRegistry
  owners: TemplateDriftOwner[]
}

export interface TemplateDriftReport extends TemplateDriftCollection {
  checks: DoctorCheck[]
  summary: DoctorSummary
  rawSummary: DoctorSummary
  suppressions: DoctorSuppressionReport[]
}
