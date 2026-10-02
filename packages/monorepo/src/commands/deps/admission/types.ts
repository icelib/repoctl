import type { DependencySection } from '../../../types/dependencies'

export interface DependencyAdmissionRule {
  id: string
  /** Exact workspace names, relative paths, directory/**, or * for all. */
  workspaces: string[]
  /** Exact names or @scope/*. Deny matches declaration/target; allow checks the target. */
  dependencies: string[]
  /** allow is an allowlist for the selected workspaces/sections; deny forbids matches. */
  effect: 'allow' | 'deny'
  /** Explicit scope prevents accidental application to development or peer declarations. */
  sections: DependencySection[]
  reason: string
  alternative?: string
  severity?: 'warn' | 'fail'
}

export interface DependencyAdmissionException {
  rule: string
  /** Exact workspace-relative directory. */
  workspace: string
  /** Exact manifest dependency key; alias targets cannot broaden an exception. */
  dependency: string
  section: DependencySection
  reason: string
  /** Valid through this YYYY-MM-DD date in UTC; warnings start seven days beforehand. */
  expiresOn?: string
}

export interface DependencyAdmissionConfig {
  rules: DependencyAdmissionRule[]
  exceptions?: DependencyAdmissionException[]
}

export interface AdmissionDeclaration {
  workspace: string
  path: string
  section: DependencySection
  name: string
  target: string | null
}

export interface DependencyAdmissionFinding {
  id: 'admission-denied' | 'admission-not-allowed' | 'admission-conflict' | 'admission-resolution' | 'admission-unused-exception' | 'admission-expired-exception' | 'admission-expiring-exception' | 'admission-selector-unmatched'
  key: string
  status: 'warn' | 'fail'
  rule: string
  detail: string
  declaration?: AdmissionDeclaration
  reason?: string
  alternative?: string
  baseline: 'new' | 'existing'
}

export interface DependencyAdmissionReport {
  schemaVersion: 1
  kind: 'dependency-admission'
  workspaceDir: string
  /** Policy fingerprint excludes absolute paths, locale and current time. */
  policyHash: string
  mode: 'full' | 'added'
  declarations: AdmissionDeclaration[]
  skipped: Array<AdmissionDeclaration & { reason: string }>
  findings: DependencyAdmissionFinding[]
  exceptions: Array<DependencyAdmissionException & { declaration: AdmissionDeclaration }>
  summary: { fail: number, warn: number, existing: number, waived: number }
}

export interface DependencyAdmissionOptions {
  config?: DependencyAdmissionConfig
  /** An earlier reviewed report made with the same policy. Invalid/missing data fails. */
  baseline?: unknown
  /** Explicitly request full checking even when a baseline was supplied. */
  full?: boolean
  /** Optional deterministic clock for programmatic integrations. */
  now?: Date
}
