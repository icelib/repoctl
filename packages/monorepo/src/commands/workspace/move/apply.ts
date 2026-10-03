import type { WorkspaceMovePlan, WorkspaceMoveResult } from '../../../types/move'
import { isDeepStrictEqual } from 'node:util'
import { moveTemplateInstances } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { withOperationLock } from '../../../core/operation-lock'
import { clearWorkspaceCache } from '../../../core/workspace'
import { discoverCleanWorkspace } from '../../clean/discovery'
import { isWithin } from '../../clean/safety'
import { hash, readInput } from '../../deps/files'
import { assertNoPendingInstanceUpgrades } from './instances'
import { exists, movedPath } from './paths'
import { planWorkspaceMove } from './plan'
import { createMoveTransaction } from './transaction'
import { validateMovePlan, verifyMovePostState } from './verify'

async function applyMove(cwd: string, plan: WorkspaceMovePlan): Promise<WorkspaceMoveResult> {
  validateMovePlan(plan)
  const root = (await discoverCleanWorkspace(cwd)).workspaceDir
  const source = path.resolve(root, plan.target.id)
  const destination = path.resolve(root, plan.destination.id)
  if (root !== plan.workspaceDir || !isWithin(root, source) || !isWithin(root, destination)) {
    throw new Error('Move plan must select directories inside this workspace.')
  }
  if (!plan.canApply) {
    throw new Error(`Workspace move is blocked: ${plan.blockers.map(item => item.code).join(', ')}.`)
  }
  const nameChange = plan.files.find(file => file.path === `${plan.target.id}/package.json`)
  const applied = source !== destination
    ? !await exists(source) && await exists(destination)
    : !!nameChange && hash(await readInput(root, nameChange.path)) === nameChange.afterHash
  if (applied) {
    let cleanupPending: string[] = []
    const registryCleanup = await moveTemplateInstances(root, plan.templateInstances, {
      apply: async () => {
        await assertNoPendingInstanceUpgrades(root, plan.templateInstances)
        cleanupPending = await verifyMovePostState(plan, [], false)
      },
      rollback: async () => {},
      committed: async () => {},
    }, true)
    cleanupPending.push(...registryCleanup)
    return { status: 'unchanged', moved: null, renamed: null, changed: [], cleanupPending, nextSteps: plan.nextSteps }
  }
  const transaction = createMoveTransaction(plan)
  try {
    const registryCleanup = await moveTemplateInstances(root, plan.templateInstances, {
      ...transaction,
      apply: async () => {
        await assertNoPendingInstanceUpgrades(root, plan.templateInstances)
        const current = await planWorkspaceMove(root, plan.selection)
        if (!isDeepStrictEqual(current, plan)) {
          throw new Error('Move plan changed or is stale. Review a new plan before applying it.')
        }
        await transaction.apply()
      },
    })
    transaction.cleanupPending.push(...registryCleanup)
  }
  finally {
    clearWorkspaceCache()
  }
  const cleanupPending = transaction.cleanupPending
  return {
    status: 'applied',
    moved: source === destination ? null : { from: plan.target.id, to: plan.destination.id },
    renamed: plan.destination.name && plan.target.name !== plan.destination.name ? { ...(plan.target.name ? { from: plan.target.name } : {}), to: plan.destination.name } : null,
    changed: plan.files.map(file => movedPath(file.path, plan.target.id, plan.destination.id)),
    cleanupPending,
    nextSteps: plan.nextSteps,
  }
}

/** Keep replay checks, validation, mutation and recovery under the same workspace lock. */
export async function applyWorkspaceMovePlan(cwd: string, plan: WorkspaceMovePlan): Promise<WorkspaceMoveResult> {
  validateMovePlan(plan)
  const root = (await discoverCleanWorkspace(cwd)).workspaceDir
  return withOperationLock(root, 'workspace-move', () => applyMove(root, plan))
}
