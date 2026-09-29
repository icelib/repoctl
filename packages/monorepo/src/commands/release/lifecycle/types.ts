import type { PublishedPackage } from '../types'

export interface ReleaseTarget extends PublishedPackage {
  target: string
}

export interface ReleaseLifecycleState {
  writer: string
  schemaVersion: 1
  repository: string
  candidates: PublishedPackage[]
  packages: ReleaseTarget[]
  accepted: PublishedPackage[]
  npm: 'pending' | 'running' | 'failed' | 'complete'
  metadata: string[]
  hooks: Record<string, 'pending' | 'running' | 'complete' | 'ignored'>
  complete: boolean
}

export interface ReleaseStateSnapshot {
  revision: string
  state: ReleaseLifecycleState
}
