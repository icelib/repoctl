import type { ReleaseBranchesConfig } from '../lines/types'
import type { ReleasePlanPackage } from '../plan/types'
import type { ReleaseOptions } from '../types'

export interface ReleasePreparationGeneratedFileContext {
  path: string
  base: string
  head: string
  before: Uint8Array | null
  after: Uint8Array | null
  packages: readonly ReleasePlanPackage[]
}

/** A trusted caller supplies this verifier; repository modules are never imported. */
export type ReleasePreparationGeneratedFile = { path: string } & (
  | { sha256: string, validate?: never }
  | { sha256?: never, validate: (context: ReleasePreparationGeneratedFileContext) => boolean | Promise<boolean> }
)

export interface ReleasePreparationPolicy {
  /** The target release line, never the candidate PR's branch-name exemption. */
  branch: string
  branches?: ReleaseBranchesConfig
  generatedFiles?: ReleasePreparationGeneratedFile[]
}

export interface ReleasePreparationValidationOptions extends Pick<ReleaseOptions, 'cwd' | 'env' | 'spawn'> {
  /** Full immutable commit IDs. The base supplies all versioning metadata. */
  base: string
  head: string
  policy: ReleasePreparationPolicy
}

export interface ReleasePreparationValidationFile {
  path: string
  status: 'expected' | 'custom-verified' | 'mismatch' | 'missing' | 'unexpected'
  reason: string
}

export interface ReleasePreparationValidationReport {
  schemaVersion: 1
  base: string
  head: string
  status: 'valid' | 'invalid'
  pnpmVersion: string | null
  packages: Array<ReleasePlanPackage & { status: 'valid' | 'invalid' }>
  files: ReleasePreparationValidationFile[]
  errors: Array<{ id: string, detail: string }>
}
