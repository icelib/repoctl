import type { DoctorCheck } from '../types'

export type InstallPolicyKey = 'minimumReleaseAge' | 'minimumReleaseAgeStrict' | 'minimumReleaseAgeExclude' | 'minimumReleaseAgeIgnoreMissingTime' | 'trustPolicy' | 'trustPolicyExclude' | 'trustPolicyIgnoreAfter' | 'trustLockfile' | 'allowBuilds' | 'onlyBuiltDependencies' | 'onlyBuiltDependenciesFile' | 'neverBuiltDependencies' | 'ignoredBuiltDependencies' | 'ignoreDepScripts' | 'ignoreScripts' | 'dangerouslyAllowAllBuilds' | 'strictDepBuilds'

export interface InstallSecurityExpectations {
  minimumReleaseAge?: number
  trustPolicy?: 'no-downgrade'
  requireBuildApproval?: boolean
  severity?: 'warn' | 'fail'
  /** Document exact pnpm exception selectors without changing pnpm's policy. */
  exceptions?: Array<{ key: 'minimumReleaseAgeExclude' | 'trustPolicyExclude', package: string, reason: string }>
}

export interface InstallSecurityOptions {
  /** Explicit version for auditing another pnpm installation; never activates that version. */
  pnpmVersion?: string
  expectations?: InstallSecurityExpectations
}

export interface InstallSecuritySetting {
  key: InstallPolicyKey
  source: string
  configured: boolean
  state: 'active' | 'unsupported' | 'removed' | 'unknown' | 'invalid'
  /** Only validated policy values; credential-bearing selectors are reduced to package names. */
  value: number | boolean | string | string[] | null
}

export interface InstallBuildDecision {
  package: string
  selector: 'package' | 'version' | 'artifact'
  decision: 'allow' | 'deny' | 'pending'
  source: string
}

export interface InstallSecurityReport {
  schemaVersion: 1
  kind: 'install-security'
  workspaceDir: string
  pnpm: { version: string | null, evidence: 'explicit' | 'observed' | 'declared' | 'unknown' }
  settings: InstallSecuritySetting[]
  builds: { decisions: InstallBuildDecision[], pendingPackages: string[], override: 'none' | 'ignore-scripts' | 'allow-all' | 'conflict' | 'unknown', default: 'unreviewed' | 'allowed' | 'blocked' | 'unknown' }
  checks: DoctorCheck[]
  summary: { pass: number, warn: number, fail: number }
  limitations: string[]
}

export interface InstallSecurityPresetPlan {
  schemaVersion: 1
  kind: 'install-security-preset'
  preset: 'balanced'
  workspaceDir: string
  pnpmVersion: string
  /** Hash of recognized active policy inputs, including global and environment values. */
  policyHash: string
  beforeHash: string
  afterHash: string
  /** Safe added policy keys only; the plan never contains complete configuration contents. */
  additions: Partial<Record<InstallPolicyKey, number | boolean | string | string[] | Record<string, boolean>>>
  preserved: InstallPolicyKey[]
  diff: string
}
