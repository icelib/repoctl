export type DoctorStatus = 'pass' | 'warn' | 'fail'

export interface DoctorCheck {
  id: string
  title: string
  status: DoctorStatus
  detail: string
  fix?: string
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
  packageManager?: string
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
  packageJsonError?: string
  packageCount: number
  workspacePatterns: string[]
  workspacePackageDirs: string[]
  workspaceManifestError?: string
  /** A package manifest prevented the broad pnpm discovery pass. */
  workspacePackageDiscoveryError?: string
  hasPackageJson: boolean
  hasWorkspaceManifest: boolean
  hasRepoctlConfig: boolean
  hasLegacyMonorepoConfig: boolean
  hasHuskyPreCommit: boolean
  hasLintStagedConfig: boolean
  isSourceWorkspace: boolean
}
