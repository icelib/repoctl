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
}

export interface ConsumerEntry {
  subpath: string
  target: string
  format: 'esm' | 'cjs'
  runtime: boolean
}
