import type { WorkspaceRemovalPlan, WorkspaceRemovalResult } from '../../../types/removal'
import type { RemovalRecovery } from './recovery'
import { lstat, rename } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { stageFileTransaction } from '../../../core/file-transaction'
import { clearWorkspaceCache } from '../../../core/workspace'
import { discoverCleanWorkspace } from '../../clean/discovery'
import { assertSafePath, isWithin } from '../../clean/safety'
import { safeFile } from '../../deps/files'
import { removalInventory } from './inventory'
import { planWorkspaceRemoval, removalNextSteps } from './plan'
import { cleanupRemovalRecovery, prepareRemovalRecovery, restoreRemovedDirectory } from './recovery'
import { validateRemovalPlan, verifyRemovalPostState } from './verify'

export async function applyWorkspaceRemovalPlan(cwd: string, plan: WorkspaceRemovalPlan): Promise<WorkspaceRemovalResult> {
  validateRemovalPlan(plan)
  const root = (await discoverCleanWorkspace(cwd)).workspaceDir
  const target = path.resolve(root, plan.target.id)
  if (root !== plan.workspaceDir || !isWithin(root, target)) {
    throw new Error('Removal plan does not select a package inside this workspace.')
  }
  if (!plan.canApply) {
    throw new Error(`Workspace removal is blocked: ${plan.blockers.map(item => item.code).join(', ')}. A Git workspace and a clean selected directory are required.`)
  }
  const present = await lstat(target).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return false
    }
    throw error
  })
  if (!present) {
    await verifyRemovalPostState(plan, false)
    return { status: 'unchanged', removed: [], changed: [], cleanupPending: [], nextSteps: [...removalNextSteps] }
  }
  const current = await planWorkspaceRemoval(root, plan.selection)
  if (!isDeepStrictEqual(current, plan)) {
    throw new Error('Removal plan changed or is stale. Review a new plan before applying it.')
  }
  const transaction = await stageFileTransaction(plan.files.map(file => ({ path: file.path, original: file.before, content: file.after })), file => safeFile(root, file), 'remove')
  let recovery: RemovalRecovery | undefined
  let moved = false
  try {
    recovery = await prepareRemovalRecovery(root)
    if (!isDeepStrictEqual((await removalInventory(root, target)).entries, plan.inventory)) {
      throw new Error('The selected directory changed before removal.')
    }
    await assertSafePath(root, target, 'directory')
    await assertSafePath(root, recovery.directory, 'directory')
    await rename(target, recovery.packageDirectory)
    moved = true
    if (!isDeepStrictEqual((await removalInventory(root, recovery.packageDirectory)).entries, plan.inventory)) {
      throw new Error('The selected directory changed while moving it to recovery storage.')
    }
    await transaction.apply()
    await verifyRemovalPostState(plan)
    if (!isDeepStrictEqual((await removalInventory(root, recovery.packageDirectory)).entries, plan.inventory)) {
      throw new Error('The selected directory changed before the removal committed.')
    }
    if (await lstat(target).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return false
      }
      throw error
    })) {
      throw new Error('A concurrent replacement of the selected directory was created.')
    }
  }
  catch (error) {
    const retained = await transaction.rollback()
    if (recovery && moved) {
      try {
        await restoreRemovedDirectory(root, recovery, target)
        moved = false
      }
      catch {
        retained.push(recovery.directory)
      }
    }
    if (recovery && !moved) {
      retained.push(...await cleanupRemovalRecovery(root, recovery))
    }
    if (retained.length) {
      throw new AggregateError([error], `Workspace removal failed; preserve concurrent edits and recover retained originals from: ${retained.join(', ')}`)
    }
    throw error
  }
  finally {
    clearWorkspaceCache()
  }
  // All semantic changes have committed. Cleanup failure must not claim rollback.
  const cleanupPending = [...await transaction.cleanup(), ...await cleanupRemovalRecovery(root, recovery!, plan.inventory)]
  return { status: 'applied', removed: [plan.target.id], changed: plan.files.map(file => file.path), cleanupPending, nextSteps: [...removalNextSteps] }
}
