export interface WorkspaceArtifactOptions {
  /** One exact workspace package name or explicit ./directory. */
  target: string
  mode: 'prune' | 'deploy'
  /** An absent or empty directory outside the source workspace. */
  output: string
  /** Deploy runtime file relative to the selected package. Defaults to main or a single bin. */
  entry?: string
  docker?: boolean
  offline?: boolean
  legacy?: boolean
}

export interface ArtifactFile {
  path: string
  kind: 'file' | 'directory' | 'link'
  mode: number
  size: number
  hash: string | null
  link: string | null
}

export interface WorkspaceArtifactPlan {
  schemaVersion: 1
  kind: 'workspace-artifact'
  workspaceDir: string
  selection: WorkspaceArtifactOptions
  target: { id: string, name: string }
  packageManager: string
  tool: { name: 'turbo' | 'pnpm', version: string, executable: string, prefix: string[], hash: string, writePaths: Array<{ name: string, value: string }> }
  /** Native command template; <output> is an isolated staging directory during apply. */
  command: { executable: string, args: string[] }
  inputs: ArtifactFile[]
  excluded: string[]
  entry: string | null
  manifestCandidates: string[]
  fingerprint: string
  notes: string[]
}

export interface WorkspaceArtifactApplyOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

export interface WorkspaceArtifactResult {
  status: 'applied' | 'unchanged'
  mode: 'prune' | 'deploy'
  output: string
  entry: string | null
  files: number
  excluded: string[]
  cleanupPending: string[]
}
