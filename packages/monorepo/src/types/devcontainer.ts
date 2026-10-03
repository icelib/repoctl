export interface DevContainerOptions {
  /** Exact stable Node version; otherwise choose a supported version allowed by engines.node. */
  nodeVersion?: string
}

export interface DevContainerFile {
  path: string
  action: 'create' | 'unchanged' | 'preserve'
  beforeHash: string | null
  afterHash: string
  content: string
  diff: string | null
}

export interface DevContainerPlan {
  schemaVersion: 1
  kind: 'devcontainer'
  workspaceDir: string
  status: 'ready' | 'blocked'
  nodeVersion: string
  nodeRange: string
  packageManager: string
  image: string
  inputs: Array<{ path: string, hash: string | null }>
  files: DevContainerFile[]
  blockers: string[]
  fingerprint: string
}

export interface DevContainerResult {
  status: 'applied' | 'unchanged'
  workspaceDir: string
  files: string[]
}
