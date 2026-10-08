export interface NpmMirrorSyncOptions {
  cwd: string
  published?: boolean
  all?: boolean
  packageName?: string
  version?: string
  dryRun?: boolean
  timeout?: number
  env?: NodeJS.ProcessEnv
}

export interface SyncTarget {
  name: string
  versions: string[]
}

export interface SyncResult extends SyncTarget {
  state: 'success' | 'failed' | 'skipped' | 'dry-run'
  taskId?: string
  error?: string
}

export interface SyncRuntime {
  fetch: typeof fetch
  now: () => number
  sleep: (milliseconds: number) => Promise<void>
}

export interface SyncContext extends SyncRuntime {
  deadline: number
}

export interface PackageMetadata {
  'versions': Record<string, unknown>
  'dist-tags': Record<string, string>
}
