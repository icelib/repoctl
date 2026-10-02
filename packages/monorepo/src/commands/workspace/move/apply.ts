import type { WorkspaceMovePlan, WorkspaceMoveResult } from '../../../types/move'
import { lstat, rename } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { stageFileTransaction } from '../../../core/file-transaction'
import { withOperationLock } from '../../../core/operation-lock'
import { clearWorkspaceCache } from '../../../core/workspace'
import { workspaceInventory } from '../../../core/workspace-mutation/inventory'
import { discoverCleanWorkspace } from '../../clean/discovery'
import { assertSafePath, isWithin } from '../../clean/safety'
import { hash, readInput, safeFile } from '../../deps/files'
import { exists, movedPath, prepareDestination } from './paths'
import { planWorkspaceMove } from './plan'
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
    const cleanupPending = await verifyMovePostState(plan, [], false)
    return { status: 'unchanged', moved: null, renamed: null, changed: [], cleanupPending, nextSteps: plan.nextSteps }
  }
  const current = await planWorkspaceMove(root, plan.selection)
  if (!isDeepStrictEqual(current, plan)) {
    throw new Error('Move plan changed or is stale. Review a new plan before applying it.')
  }
  const sourceMetadata = await lstat(source)
  let reservation: Awaited<ReturnType<typeof prepareDestination>> | undefined
  let transaction: Awaited<ReturnType<typeof stageFileTransaction>> | undefined
  let moved = false
  try {
    if (!isDeepStrictEqual((await workspaceInventory(root, source)).entries, plan.inventory)) {
      throw new Error('The selected package changed before moving.')
    }
    if (source !== destination) {
      reservation = await prepareDestination(root, plan.destination.id)
      await reservation.move(source)
      moved = true
      if (!isDeepStrictEqual((await workspaceInventory(root, destination)).entries, plan.inventory)) {
        throw new Error('The selected package changed while moving.')
      }
    }
    transaction = await stageFileTransaction(plan.files.map(file => ({
      path: movedPath(file.path, plan.target.id, plan.destination.id),
      original: file.before,
      content: file.after,
    })), file => safeFile(root, file), 'move')
    await transaction.apply()
    clearWorkspaceCache()
    await verifyMovePostState(plan, transaction.recoveryPaths())
  }
  catch (error) {
    const retained = transaction ? await transaction.rollback() : error instanceof AggregateError ? [destination] : []
    if (moved) {
      try {
        await assertSafePath(root, destination, 'directory')
        const metadata = await lstat(destination)
        if (retained.length || metadata.ino !== sourceMetadata.ino || metadata.dev !== sourceMetadata.dev || await exists(source)) {
          throw new Error('Concurrent edits or recovery files require preserving the moved package.')
        }
        if (path.dirname(source) !== root) {
          await assertSafePath(root, path.dirname(source), 'directory')
        }
        await rename(destination, source)
        moved = false
      }
      catch {
        retained.push(destination)
      }
    }
    if (reservation && !moved) {
      retained.push(...await reservation.cleanup())
    }
    if (retained.length) {
      throw new AggregateError([error], `Workspace move failed; preserve concurrent changes and recover retained originals from: ${retained.join(', ')}`)
    }
    throw error
  }
  finally {
    clearWorkspaceCache()
  }
  const cleanupPending = await transaction!.cleanup()
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
