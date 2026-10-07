export interface ReleaseOidcAuditOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
  /** 注入请求实现，便于在无凭据环境验证故障与脱敏边界。 */
  fetch?: typeof globalThis.fetch
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
