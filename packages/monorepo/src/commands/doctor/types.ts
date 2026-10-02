import type { DoctorManifest } from './manifest/types'

export type DoctorStatus = 'pass' | 'warn' | 'fail'

export interface DoctorCheck {
  id: string
  title: string
  status: DoctorStatus
  detail: string
  fix?: string
  /** Workspace-relative manifest path, when the rule targets a package. */
  path?: string
  /** Stable manifest field name; never translated. */
  field?: string
}

export interface DoctorSummary {
  pass: number
  warn: number
  fail: number
}

export interface DoctorReport {
  cwd: string
  workspaceDir: string
  packageCount: number
  checks: DoctorCheck[]
  summary: DoctorSummary
}

export interface DoctorPackageJson {
  packageManager?: string | undefined
  engines?: {
    node?: string
  }
  dependencies?: Record<string, string | undefined>
  devDependencies?: Record<string, string | undefined>
  scripts?: Record<string, string | undefined>
}

export interface DoctorContext {
  cwd: string
  workspaceDir: string
  packageJson: DoctorPackageJson
  packageCount: number
  workspacePatterns: string[]
  workspacePackageDirs: string[]
  hasPackageJson: boolean
  hasWorkspaceManifest: boolean
  hasRepoctlConfig: boolean
  hasLegacyMonorepoConfig: boolean
  hasHuskyPreCommit: boolean
  hasLintStagedConfig: boolean
  isSourceWorkspace: boolean
  manifests: DoctorManifest[]
  workspaceManifestError: boolean
}
