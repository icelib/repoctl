import type { WorkspaceArtifactPlan, WorkspaceArtifactResult } from '..'
import { expectType } from 'tsd'
import { applyWorkspaceArtifactPlan, planWorkspaceArtifact } from '..'

const plan = planWorkspaceArtifact('.', { target: 'service', mode: 'deploy', output: '../runtime', entry: 'dist/index.js', offline: true })
expectType<Promise<WorkspaceArtifactPlan>>(plan)
declare const reviewed: WorkspaceArtifactPlan
expectType<'prune' | 'deploy'>(reviewed.selection.mode)
expectType<Promise<WorkspaceArtifactResult>>(applyWorkspaceArtifactPlan('.', reviewed, { signal: new AbortController().signal }))
// @ts-expect-error Only explicit native artifact modes are supported.
planWorkspaceArtifact('.', { target: 'service', mode: 'publish', output: '../runtime' })
