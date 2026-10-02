import type { WorkspaceGraphDiagnostic, WorkspaceGraphEdge, WorkspaceGraphNode, WorkspaceImpactResult } from '../core/workspace-graph/types'
import type { WorkspaceRemovalEntry, WorkspaceRemovalFile } from './removal'

export interface WorkspaceMoveOptions {
  target: string
  /** Workspace-relative destination; omit for a package-name-only change. */
  to?: string
  /** New npm package name; omit for a directory-only move. */
  name?: string
}

export interface WorkspaceMoveReview {
  scope: 'git-tracked-text-candidates'
  scanned: string[]
  skipped: string[]
  tasks: { path: string, line: number, reason: string }[]
}

export interface WorkspaceMovePlan {
  schemaVersion: 1
  kind: 'workspace-move'
  workspaceDir: string
  selection: { target: string, to: string, name?: string }
  target: WorkspaceGraphNode
  destination: { id: string, name?: string }
  canApply: boolean
  blockers: { code: string, paths: string[] }[]
  consumers: WorkspaceImpactResult['consumers']
  references: WorkspaceGraphEdge[]
  diagnostics: WorkspaceGraphDiagnostic[]
  /** Paths are relative to the workspace before moving the package. */
  files: WorkspaceRemovalFile[]
  inputs: { path: string, hash: string }[]
  inventory: WorkspaceRemovalEntry[]
  workspaces: WorkspaceGraphNode[]
  git: { root: string, head: string } | null
  review: WorkspaceMoveReview
  nextSteps: string[]
}

export interface WorkspaceMoveResult {
  status: 'applied' | 'unchanged'
  moved: { from: string, to: string } | null
  renamed: { from?: string, to: string } | null
  changed: string[]
  cleanupPending: string[]
  nextSteps: string[]
}
