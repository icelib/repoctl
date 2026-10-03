import type { WorkspaceGraphDiagnostic, WorkspaceGraphEdge, WorkspaceGraphNode, WorkspaceImpactResult } from '../core/workspace-graph/types'

export interface WorkspaceRemovalOptions {
  target: string
  /** Remove only the exact manifest dependency fields shown by the plan. */
  removeReferences?: boolean
}

export interface WorkspaceRemovalBlocker {
  code: 'git_unavailable' | 'dirty_target' | 'nested_repository' | 'consumers' | 'graph_incomplete' | 'unsupported_manifest'
  paths: string[]
}

export interface WorkspaceRemovalEntry {
  /** Path relative to the selected package; . denotes its directory. */
  path: string
  kind: 'directory' | 'file' | 'symlink'
  mode: number
  mtimeMs: number
  size?: number
  hash?: string
  link?: string
}

export interface WorkspaceRemovalFile {
  path: string
  before: string
  after: string
  beforeHash: string
  afterHash: string
  fields: string[]
}

export interface WorkspaceRemovalPlan {
  schemaVersion: 1
  kind: 'workspace-removal'
  workspaceDir: string
  selection: { target: string, removeReferences: boolean }
  target: WorkspaceGraphNode
  canApply: boolean
  blockers: WorkspaceRemovalBlocker[]
  consumers: WorkspaceImpactResult['consumers']
  references: WorkspaceGraphEdge[]
  diagnostics: WorkspaceGraphDiagnostic[]
  files: WorkspaceRemovalFile[]
  inputs: { path: string, hash: string }[]
  inventory: WorkspaceRemovalEntry[]
  workspaces: string[]
  git: { root: string, head: string } | null
  review: {
    /** Tracked text files outside the target; neither imports nor dynamic config are resolved. */
    scope: 'git-tracked-text-literal-matches'
    scanned: string[]
    matches: { path: string, values: string[] }[]
    skipped: string[]
  }
  nextSteps: string[]
}

export interface WorkspaceRemovalResult {
  status: 'applied' | 'unchanged'
  removed: string[]
  changed: string[]
  /** The operation committed, but its own recovery files require manual cleanup. */
  cleanupPending: string[]
  nextSteps: string[]
}
