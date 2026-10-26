export interface ReleaseOidcAuditPackage {
  name: string
  version: string
  registry?: string
}

interface ReleaseOidcAuditContext {
  env?: NodeJS.ProcessEnv
  /** 注入请求实现，便于在无凭据环境验证故障与脱敏边界。 */
  fetch?: typeof globalThis.fetch
}

export interface ReleaseOidcAuditOptions extends ReleaseOidcAuditContext {
  cwd: string
  /** Exact planned candidates, including a publishable workspace root when selected. */
  packageNames?: string[]
  packages?: never
}

export interface ReleaseOidcArtifactAuditOptions extends ReleaseOidcAuditContext {
  /** Validated artifact candidates; this mode never reads a workspace or executable configuration. */
  packages: readonly ReleaseOidcAuditPackage[]
  cwd?: never
  packageNames?: never
}

export interface ReleaseOidcPackageResult {
  package: string
  ok: boolean
  status: number | null
  message: string
}

export interface ReleaseOidcAuditReport {
  schemaVersion: 1
  identity: Record<string, string>
  results: ReleaseOidcPackageResult[]
  ok: boolean
  hints: string[]
}
