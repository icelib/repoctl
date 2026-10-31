export interface PackageCheckOptions {
  cwd: string
  /** pnpm filter selectors; repeated selectors form a union. */
  filters?: string[]
  includePrivate?: boolean
  /** Workspace build script, executed in dependency order before any pack. */
  buildScript?: string
  strict?: boolean
  /** Preserve tarballs and consumers for reproducing diagnostics. */
  keepTemp?: boolean
  /** Per subprocess timeout, including build and consumer installation. */
  timeoutMs?: number
}

export interface PackageCheckDiagnostic {
  source: 'repoctl' | 'publint' | 'attw' | 'node'
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  entry?: string
  file?: string
  /** Original upstream diagnostic, without translating its identifiers. */
  detail?: unknown
}

export interface PackageCheckCommand {
  cwd: string
  executable: string
  args: string[]
  exitCode: number | null
  output: string
  stdout: string
  stderr: string
}

export interface ConsumerHost {
  os: string
  cpu: string
  libc?: string
}

export interface ConsumerApplicability {
  status: 'applicable' | 'not-applicable'
  host: ConsumerHost
  reason?: string
}

export interface ConsumerPackageApplicability extends ConsumerApplicability {
  name: string
  version: string
}

export interface PackageCheckResult {
  name: string
  directory: string
  role: 'selected' | 'dependency'
  status: 'passed' | 'failed' | 'skipped'
  reason?: string
  tarball?: string
  files: string[]
  diagnostics: PackageCheckDiagnostic[]
  commands: PackageCheckCommand[]
  /** 运行时消费仅在真实宿主支持该包时执行，静态校验始终保留。 */
  applicability?: ConsumerApplicability
}

export interface PackageCheckReport {
  schemaVersion: 1
  workspaceDir: string
  status: 'passed' | 'failed'
  build?: PackageCheckCommand
  packages: PackageCheckResult[]
  temporaryDirectory?: string
  retained: boolean
  tools: { publint: string, attw: string }
}

export interface PackedPackage {
  result: PackageCheckResult
  manifest: PackedManifest
  bytes: Uint8Array<ArrayBuffer>
}

/** 公开入口所需的隔离运行环境或精确的平台保护错误。 */
export type ConsumerRuntimeContext = 'vitest' | { kind: 'expected-error', name: 'Error', message: string }

/** package.json 中 repoctl.packageCheck 的公开配置合同。 */
export interface PackageCheckManifestOptions {
  /** 只做解析与语法检查的精确 JavaScript 资源导出。 */
  runtimeAssets?: string[]
  /** 在对应环境中真实执行的精确 ESM 导出。 */
  runtimeContexts?: Record<string, ConsumerRuntimeContext>
}

export interface PackedManifest {
  name?: string
  version?: string
  type?: string
  main?: string
  types?: string
  exports?: unknown
  bin?: string | Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  os?: string[]
  cpu?: string[]
  libc?: string[]
  repoctl?: { packageCheck?: { runtimeAssets?: unknown, runtimeContexts?: unknown } }
}

export interface ConsumerEntry {
  subpath: string
  target: string
  format: 'esm' | 'cjs'
  runtime: boolean
  asset?: boolean
  context?: ConsumerRuntimeContext
  /** Resources without their own declaration contract are resolved as files, not imported as types. */
  typecheck?: boolean
}
