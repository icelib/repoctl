import type { BigIntStats } from 'node:fs'
import type { WorkspaceMovePlan } from '../../../types/move'
import { lstat, rename } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { stageFileTransaction } from '../../../core/file-transaction'
import { clearWorkspaceCache } from '../../../core/workspace'
import { workspaceInventory } from '../../../core/workspace-mutation/inventory'
import { assertSafePath } from '../../clean/safety'
import { safeFile } from '../../deps/files'
import { exists, movedPath, prepareDestination } from './paths'
import { verifyMovePostState } from './verify'

/** File backups remain available until the instance registry has committed. */
export function createMoveTransaction(plan: WorkspaceMovePlan) {
  const root = plan.workspaceDir
  const source = path.resolve(root, plan.target.id)
  const destination = path.resolve(root, plan.destination.id)
  let sourceMetadata: BigIntStats | undefined
  let reservation: Awaited<ReturnType<typeof prepareDestination>> | undefined
  let transaction: Awaited<ReturnType<typeof stageFileTransaction>> | undefined
  let moved = false
  let failure: unknown
  const cleanupPending: string[] = []
  return {
    cleanupPending,
    async apply() {
      try {
        sourceMetadata = await lstat(source, { bigint: true })
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
        failure = error
        throw error
      }
    },
    async rollback() {
      const retained = transaction ? await transaction.rollback() : failure instanceof AggregateError ? [destination] : []
      if (moved) {
        try {
          await assertSafePath(root, destination, 'directory')
          const metadata = await lstat(destination, { bigint: true })
          if (retained.length || metadata.ino !== sourceMetadata!.ino || metadata.dev !== sourceMetadata!.dev || await exists(source)) {
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
        throw new Error(`Workspace move failed; preserve concurrent changes and recover retained originals from: ${retained.join(', ')}`)
      }
    },
    async committed() {
      cleanupPending.push(...await transaction!.cleanup())
    },
  }
}
