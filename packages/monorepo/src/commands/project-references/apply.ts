import type { ProjectReferencesApplyResult, ProjectReferencesPlan } from '../../types'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, realpath, rmdir, unlink } from 'node:fs/promises'
import path from 'pathe'
import { stageFileTransaction } from '../../core/file-transaction'
import { withOperationLock } from '../../core/operation-lock'
import { safeFile } from '../deps/files'
import { exists, ownershipFile } from './files'
import { planProjectReferences } from './plan'

/** Re-derive every byte before staging, then verify the final graph before discarding backups. */
async function applyLocked(plan: ProjectReferencesPlan): Promise<ProjectReferencesApplyResult> {
  const fresh = await planProjectReferences(plan.workspaceDir)
  if (!fresh.enabled) {
    throw new Error('Enable tooling.projectReferences.enabled before synchronization.')
  }
  if (fresh.diagnostics.length) {
    throw new Error(`Project references have unresolved diagnostics: ${fresh.diagnostics.map(item => item.message).join('; ')}`)
  }
  const result: ProjectReferencesApplyResult = { schemaVersion: 1, changed: [], recoveryFiles: [], validation: fresh.validation }
  if (fresh.action === 'unchanged' && Array.isArray(plan.operations) && plan.operations.every(item => item && typeof item.path === 'string' && typeof item.after === 'string') && (await Promise.all(plan.operations.map(async item => await exists(plan.workspaceDir, item.path) && await readFile(await safeFile(plan.workspaceDir, item.path), 'utf8') === item.after))).every(Boolean)) {
    return result
  }
  if (JSON.stringify(fresh) !== JSON.stringify(plan)) {
    throw new Error('Project references plan is stale or modified; generate and review a fresh plan.')
  }
  const directory = path.join(plan.workspaceDir, '.repoctl')
  const registry = path.join(plan.workspaceDir, ownershipFile)
  const placeholder = `${JSON.stringify({ schemaVersion: 1, configs: {}, transaction: randomUUID() })}\n`
  let createdDirectory = false
  let createdFile: { ino: bigint, dev: bigint } | undefined
  let placeholderWritten = false
  let transaction: Awaited<ReturnType<typeof stageFileTransaction>> | undefined
  try {
    if (plan.operations.some(item => item.before === null)) {
      try {
        await mkdir(directory)
        createdDirectory = true
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error
        }
      }
      await exists(plan.workspaceDir, ownershipFile)
      const handle = await open(registry, 'wx')
      try {
        createdFile = await handle.stat({ bigint: true })
        await handle.writeFile(placeholder)
        placeholderWritten = true
      }
      finally {
        await handle.close()
      }
    }
    transaction = await stageFileTransaction(plan.operations.map(item => ({ path: item.path, original: item.before ?? placeholder, content: item.after })), file => safeFile(plan.workspaceDir, file), 'references')
    await transaction.apply()
    const verification = await planProjectReferences(plan.workspaceDir)
    if (verification.action !== 'unchanged') {
      throw new Error('Project references changed during final verification.')
    }
    result.changed = plan.operations.map(item => item.path)
  }
  catch (error) {
    const recovery = await transaction?.rollback() ?? []
    if (createdFile && !recovery.length) {
      try {
        if (await exists(plan.workspaceDir, ownershipFile)) {
          await safeFile(plan.workspaceDir, ownershipFile)
          const current = await lstat(registry, { bigint: true })
          // Rollback restores a backup inode, so the unique token proves ownership after replacement.
          const owned = placeholderWritten ? await readFile(registry, 'utf8') === placeholder : current.ino === createdFile.ino && current.dev === createdFile.dev
          if (!owned) {
            throw new Error('Registry placeholder was replaced')
          }
          await unlink(registry)
        }
      }
      catch {
        recovery.push(registry)
      }
    }
    if (createdDirectory && !recovery.length) {
      await rmdir(directory).catch(() => {})
    }
    if (recovery.length) {
      throw new AggregateError([error], `Project reference rollback needs attention; preserve recovery files: ${recovery.join(', ')}`)
    }
    throw error
  }
  result.recoveryFiles = await transaction?.cleanup() ?? []
  return result
}

export async function applyProjectReferencesPlan(plan: ProjectReferencesPlan): Promise<ProjectReferencesApplyResult> {
  if (plan?.schemaVersion !== 1 || typeof plan.workspaceDir !== 'string' || path.normalize(await realpath(plan.workspaceDir)) !== plan.workspaceDir) {
    throw new Error('Invalid project references plan or noncanonical workspace root.')
  }
  return withOperationLock(plan.workspaceDir, 'typescript-references', () => applyLocked(plan))
}
