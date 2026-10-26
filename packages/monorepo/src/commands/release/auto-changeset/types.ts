export type AutoChangesetLevel = 'patch' | 'minor' | 'major'
export type AutoChangesetDependencyField = 'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies'

/** Declarative JSON read from the default branch, or supplied by a trusted API caller. */
export interface AutoChangesetPolicy {
  schemaVersion?: 1
  ignorePaths?: string[]
  paths?: Array<{ patterns: string[], packages?: string[], release?: boolean, level?: AutoChangesetLevel }>
  links?: Array<{
    from: string[]
    to?: string[]
    dependents?: boolean
    dependencyFields?: AutoChangesetDependencyField[]
    level?: AutoChangesetLevel | 'same'
  }>
  labels?: Record<string, AutoChangesetLevel | 'none'>
  titleTypes?: Record<string, AutoChangesetLevel>
  defaultLevel?: AutoChangesetLevel
  breakingRequiresLabel?: boolean
  summary?: { language?: 'en' | 'zh-CN', template?: string, byType?: Record<string, string> }
}

export interface AutoChangesetRevision {
  repository: string
  repositoryId: number
  pullRequest: number
  headRepository: string
  headRepositoryId: number
  headSha: string
  headRef: string
  baseSha: string
  baseRef: string
  defaultBranch: string
  policySha: string
  policyDigest: string
  title: string
  labels: string[]
  changedFiles: number
  state: 'open' | 'closed'
  draft: boolean
  /** Binds the approved application to the same Actions attempt as its plan. */
  workflowRun?: { id: number, attempt: number }
}

export interface AutoChangesetOptions {
  repository: string
  pullRequest: number
  token?: string
  fetch?: typeof globalThis.fetch
  expectedHeadSha?: string
  expectedBaseSha?: string
  policyPath?: string
  policy?: AutoChangesetPolicy
  env?: NodeJS.ProcessEnv
}

export interface AutoChangesetDecision {
  name: string
  directory: string
  level: AutoChangesetLevel
  reasons: string[]
}

export interface AutoChangesetReport {
  schemaVersion: 1
  revision: AutoChangesetRevision
  status: 'planned' | 'unchanged' | 'manual' | 'no-release' | 'protected' | 'fork' | 'inactive' | 'applied'
  packages: AutoChangesetDecision[]
  diagnostics: string[]
  change?: { path: string, action: 'upsert' | 'delete', content?: string }
  commitSha?: string
}

export interface AutoChangesetApproval {
  environment?: string
  workflowPath?: string
  planJobName?: string
  applyJobName?: string
}

export interface AutoChangesetApplyOptions extends AutoChangesetOptions {
  expected: AutoChangesetRevision
  approval?: AutoChangesetApproval
}

export interface AutoChangesetWorkflowOptions extends AutoChangesetApproval {
  workflowName?: string
  policyPath?: string
}
