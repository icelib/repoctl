import type { ReleaseBranchRule } from '../lines/types'
import type { ReleaseNoteDocument } from '../notes/model'
import type { ReleaseOptions } from '../types'

export interface ReleasePlanPackage {
  name: string
  directory: string
  currentVersion: string
  newVersion: string
  bump: string
  reasons: string[]
  lane: string
  private: boolean
  publishCandidate: boolean
  intents: Array<{ path: string, bump: string, summary: string }>
}

export interface ReleasePlan {
  schemaVersion: 1
  branchRule: ReleaseBranchRule | null
  cwd: string
  pnpmVersion: string | null
  nativeFormat: 'json' | 'text' | null
  status: 'ready' | 'empty' | 'blocked'
  packages: ReleasePlanPackage[]
  blockers: Array<{ id: string, detail: string }>
  notes: ReleaseNoteDocument
}

export type ReleasePlanOptions = Pick<ReleaseOptions, 'cwd' | 'env' | 'spawn' | 'branch' | 'config'>
