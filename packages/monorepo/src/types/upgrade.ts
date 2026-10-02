import type { CliOpts } from './cli'

export interface UpgradeOptions extends CliOpts {
  /** Return a complete plan without preparing assets, prompting or writing files. */
  dryRun?: boolean
  /** Override the configured asset selection with exact files or directory prefixes. */
  targets?: string[]
}

export type UpgradeFileStatus = 'add' | 'modify' | 'delete' | 'identical' | 'skip' | 'conflict'

export interface UpgradeFilePlan {
  path: string
  status: UpgradeFileStatus
  /** Stable machine-readable explanation. */
  reason: string
  detail: string
  beforeHash: string | null
  afterHash: string | null
  /** Exact planned bytes in base64; null means deletion or no write. */
  content: string | null
  binary: boolean
  diff: string | null
  /** Files in a group must be applied together. */
  group: string | null
  /** The legacy interactive command can approve these changes without a prompt. */
  automatic: boolean
}

export interface UpgradeInput {
  area: 'target' | 'asset' | 'config'
  path: string
  hash: string | null
}

export interface UpgradePlan {
  schemaVersion: 1
  cwd: string
  rootDir: string
  assetDir: string
  status: 'ready' | 'blocked'
  targets: string[]
  discovery: { patterns: string[] | null, manifests: string[] } | null
  inputs: UpgradeInput[]
  files: UpgradeFilePlan[]
  blockers: { id: string, path: string | null, detail: string }[]
}

export interface UpgradeApplyOptions {
  /** Apply only these reviewed paths; omitted means every actionable plan entry. */
  files?: string[]
}

export interface UpgradeApplyResult {
  status: 'applied' | 'unchanged'
  changed: string[]
}
