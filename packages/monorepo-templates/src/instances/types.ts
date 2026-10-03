import type { ResolvedTemplateRemoteSource } from '../types'

export interface TemplateSnapshotFile {
  path: string
  content: string
  executable: boolean
}

export interface TemplateSnapshot {
  schemaVersion: 1
  files: TemplateSnapshotFile[]
  directories: string[]
}

export type TemplateGenerationProfile = 'workspace-copy-v1' | 'repo-new-v1' | 'repo-new-parameters-v1'

/** Only these non-secret inputs are retained; arbitrary config and environment are never serialized. */
export interface TemplateGenerationParameters {
  packageName?: string
  renameJson?: boolean
  /** Validated nonsensitive template inputs only. */
  templateValues?: Record<string, string | boolean>
  /** Names only; values are never retained. */
  sensitiveParameters?: string[]
}

export interface TemplateInstanceSource {
  kind: 'package' | 'snapshot' | 'remote'
  templatePath: string
  packageName?: string
  version?: string
  digest?: string
  remote?: ResolvedTemplateRemoteSource
}

export type TemplateInstanceBaseline
  = { status: 'available', original: string, rendered: string }
    | { status: 'unverified', reason: 'source-unavailable' }

export interface TemplateInstance {
  id: string
  target: string
  template: string
  provenance: 'created' | 'linked'
  source: TemplateInstanceSource
  generator: { profile: TemplateGenerationProfile, version: string }
  parameters: TemplateGenerationParameters
  baseline: TemplateInstanceBaseline
  /** Explicit instance-relative files or directories excluded from future template upgrades. */
  excludedPaths?: string[]
}

export interface TemplateInstanceRegistry {
  schemaVersion: 1
  instances: TemplateInstance[]
}

export interface TemplateInstanceInfo {
  instance: TemplateInstance
  targetStatus: 'present' | 'missing' | 'unsafe'
  baselineStatus: 'available' | 'unverified' | 'unavailable'
}

export interface PreparedTemplateSource {
  source: TemplateInstanceSource
  snapshot: TemplateSnapshot
}

export interface GeneratedTemplateInstanceOptions {
  workspaceDir: string
  targetDir: string
  template: string
  preparedSource: PreparedTemplateSource
  profile: TemplateGenerationProfile
  parameters?: TemplateGenerationParameters
  generatorVersion?: string
  /** Secret-bearing output files stay outside recorded baselines and later upgrades. */
  excludedPaths?: string[]
}

export interface TemplateInstanceDraft {
  instance: TemplateInstance
  snapshots: Record<string, TemplateSnapshot>
}

export interface TemplateInstanceRegistrationOptions extends Partial<Pick<TemplateInstanceReplacementHooks, 'rollback' | 'committed'>> {
  /** Generated path-based IDs may collide after relocation; explicit caller IDs remain strict by default. */
  allocateIdOnConflict?: boolean
}

/** File-side transaction hooks run while the instance registry lock is held. */
export interface TemplateInstanceReplacementHooks {
  apply: () => Promise<void>
  rollback: () => Promise<void>
  committed: () => Promise<void>
}

export interface TemplateInstanceMovePlan {
  from: string
  to: string
  beforeHash: string
  afterHash: string
  relocations: { id: string, from: string, to: string }[]
}

export interface TemplateFileDifference {
  path: string
  status: 'added' | 'modified' | 'deleted'
}
