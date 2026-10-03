import type { WorkspaceRemovalOptions, WorkspaceRemovalPlan, WorkspaceRemovalResult } from '..'
import { expectError, expectType } from 'tsd'
import { applyWorkspaceRemovalPlan, planWorkspaceRemoval } from '..'

const options: WorkspaceRemovalOptions = { target: '@scope/old', removeReferences: true }
expectType<Promise<WorkspaceRemovalPlan>>(planWorkspaceRemoval('.', options))
declare const plan: WorkspaceRemovalPlan
expectType<Promise<WorkspaceRemovalResult>>(applyWorkspaceRemovalPlan('.', plan))
expectType<boolean>(plan.canApply)
expectType<'git-tracked-text-literal-matches'>(plan.review.scope)
expectError(planWorkspaceRemoval('.', { target: 'old', force: true }))
expectError(planWorkspaceRemoval('.', {}))
