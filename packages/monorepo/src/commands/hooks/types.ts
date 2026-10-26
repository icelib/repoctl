export interface GitHookCheck {
  /** Unique check name; repoctl prefixes generated native job names. */
  name: string
  /** Native Lefthook command, executed with its partially staged file protection. */
  run: string
  glob?: string
  stageFixed?: boolean
}

export interface GitHooksConfig {
  /** Native jobs inserted immediately before the final staged typecheck. */
  preCommit?: GitHookCheck[]
}

export interface GitHooksInstallOptions {
  /** Process environment, including Git configuration isolation and CI detection. */
  env?: NodeJS.ProcessEnv
}

export interface GitHooksInstallResult {
  status: 'installed' | 'skipped'
  reason?: 'ci' | 'disabled' | 'not-git' | 'custom-hooks-path' | 'custom-husky'
  migrated: boolean
  configuredChecks: string[]
  hooksPath?: string
}
