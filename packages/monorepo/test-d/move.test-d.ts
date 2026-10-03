import type { WorkspaceMoveOptions, WorkspaceMovePlan, WorkspaceMoveResult } from '..'
import { expectError, expectType } from 'tsd'
import { applyWorkspaceMovePlan, planWorkspaceMove } from '..'

const options: WorkspaceMoveOptions = { target: 'old', to: 'libs/core', name: '@org/core' }
expectType<Promise<WorkspaceMovePlan>>(planWorkspaceMove('.', options))
declare const plan: WorkspaceMovePlan
expectType<Promise<WorkspaceMoveResult>>(applyWorkspaceMovePlan('.', plan))
expectType<string>(plan.destination.id)
expectType<number>(plan.review.tasks[0]!.line)
expectError(planWorkspaceMove('.', { target: 'old', force: true }))
expectError(planWorkspaceMove('.', { target: 'old', name: 1 }))
