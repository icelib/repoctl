import type { WorkspaceGraphDiagnostic } from '../../../core/workspace-graph'

export interface AffectedCheckSettings {
  base?: string
  head?: string
  /** Exact package names or workspace-relative directories, intersected with affected packages. */
  filters?: string[]
  /** Additional workspace-relative globs that invalidate every package. */
  globalInputs?: string[]
}

export interface AffectedCheckOptions extends AffectedCheckSettings {
  cwd: string
}

export interface AffectedFile {
  path: string
  kinds: Array<'added' | 'deleted' | 'modified' | 'type_changed' | 'unmerged' | 'untracked'>
  owner?: string
  reason?: 'global_input' | 'workspace_manifest' | 'documentation' | 'unowned'
}

export interface AffectedGitRange {
  base: string
  head: string
  baseCommit: string | null
  headCommit: string | null
  mergeBase: string | null
  includesWorkingTree: boolean
}

export interface AffectedFallback {
  code: 'git_unavailable' | 'base_unavailable' | 'head_unavailable' | 'merge_base_unavailable' | 'git_diff_failed' | 'head_not_checked_out' | 'workspace_not_git_root' | 'unmerged_changes' | 'global_input' | 'workspace_manifest_changed' | 'unowned_change' | 'graph_diagnostics' | 'global_inputs_unavailable'
  files?: string[]
  diagnostics?: WorkspaceGraphDiagnostic[]
}

export interface AffectedPackage {
  id: string
  name?: string
  selected: boolean
  reasons: Array<{
    code: 'direct_change' | 'dependent' | 'full_fallback'
    files?: string[]
    /** Consumer-to-changed-package path. */
    path?: string[]
  }>
  skippedReason?: 'not_affected' | 'filtered_out'
}

export interface AffectedCheckCommand {
  name: string
  command: string
  description: string
  executable: 'pnpm'
  args: string[]
  scope: 'root' | 'packages'
  targets: string[]
  missingTargets: string[]
  /** Build-only prerequisites selected in addition to affected checks. */
  prerequisiteTargets: string[]
  skipReason?: 'no_affected_packages' | 'filter_intersection_empty' | 'missing_script'
}

export interface AffectedCheckPlan {
  schemaVersion: 1
  mode: 'affected'
  cwd: string
  git: AffectedGitRange
  strategy: 'affected' | 'full'
  fallback: AffectedFallback[]
  globalInputs: string[]
  files: AffectedFile[]
  packages: AffectedPackage[]
  commands: AffectedCheckCommand[]
}
