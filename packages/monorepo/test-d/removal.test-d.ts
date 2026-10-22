import type { WorkspaceRemovalOptions, WorkspaceRemovalPlan, WorkspaceRemovalResult } from '@icebreakers/monorepo'
import { applyWorkspaceRemovalPlan, planWorkspaceRemoval } from '@icebreakers/monorepo'
import { expectError, expectType } from 'tsd'

const options: WorkspaceRemovalOptions = { target: '@scope/old', removeReferences: true }
expectType<Promise<WorkspaceRemovalPlan>>(planWorkspaceRemoval('.', options))
declare const plan: WorkspaceRemovalPlan
expectType<Promise<WorkspaceRemovalResult>>(applyWorkspaceRemovalPlan('.', plan))
expectType<boolean>(plan.canApply)
expectType<'git-tracked-text-literal-matches'>(plan.review.scope)
expectError(planWorkspaceRemoval('.', { target: 'old', force: true }))
expectError(planWorkspaceRemoval('.', {}))
