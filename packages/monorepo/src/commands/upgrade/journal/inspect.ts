import type { UpgradeTransactionInspection } from './types'
import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'pathe'
import { normalizeUpgradeTargetDir } from './lock'
import { isJournal } from './shared'
import { upgradeTransactionDirectory } from './types'

const journalFileName = 'journal.json'

function malformedStorage(targetDir: string, root: string): UpgradeTransactionInspection {
  return {
    id: path.basename(root),
    path: root,
    targetDir,
    state: 'malformed',
    operationCount: 0,
    appliedCount: 0,
    needsReview: true,
  }
}

/**
 * Read unfinished upgrade journals without changing the target project.
 * Malformed journals are reported as needs-review instead of being deleted.
 */
export async function inspectUpgradeTransactions(targetDir: string): Promise<UpgradeTransactionInspection[]> {
  const resolvedTargetDir = await normalizeUpgradeTargetDir(targetDir)
  const root = path.join(resolvedTargetDir, upgradeTransactionDirectory)
  let entries
  try {
    const parent = await lstat(path.dirname(root))
    if (!parent.isDirectory() || parent.isSymbolicLink()) {
      return [malformedStorage(resolvedTargetDir, path.dirname(root))]
    }
    const storage = await lstat(root)
    if (!storage.isDirectory() || storage.isSymbolicLink()) {
      return [malformedStorage(resolvedTargetDir, root)]
    }
    entries = await readdir(root, { withFileTypes: true })
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') {
      return [malformedStorage(resolvedTargetDir, root)]
    }
    throw error
  }

  const inspections: UpgradeTransactionInspection[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const directory = path.join(root, entry.name)
    const journalPath = path.join(directory, journalFileName)
    try {
      const value: unknown = JSON.parse(await readFile(journalPath, 'utf8'))
      if (!isJournal(value) || value.id !== entry.name || await normalizeUpgradeTargetDir(value.targetDir) !== resolvedTargetDir) {
        inspections.push({
          id: entry.name,
          path: journalPath,
          targetDir: resolvedTargetDir,
          state: 'malformed',
          operationCount: 0,
          appliedCount: 0,
          needsReview: true,
        })
        continue
      }
      // A completed journal is safe to ignore if a process was terminated
      // between committing it and removing its transaction directory. A
      // preview must not delete even this metadata, so cleanup is left to
      // the transaction owner.
      if (value.state === 'completed') {
        continue
      }
      const inspection: UpgradeTransactionInspection = {
        id: value.id,
        path: journalPath,
        targetDir: resolvedTargetDir,
        state: value.state,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        pid: value.pid,
        operationCount: value.operations.length,
        appliedCount: value.operations.filter(operation => operation.applied).length,
        needsReview: true,
      }
      if (value.error !== undefined) {
        inspection.error = value.error
      }
      inspections.push(inspection)
    }
    catch {
      inspections.push({
        id: entry.name,
        path: journalPath,
        targetDir: resolvedTargetDir,
        state: 'malformed',
        operationCount: 0,
        appliedCount: 0,
        needsReview: true,
      })
    }
  }
  return inspections
}

/** Throw before a new mutation when an interrupted transaction needs review. */
export async function assertNoPendingUpgradeTransactions(targetDir: string) {
  const pending = (await inspectUpgradeTransactions(targetDir)).filter(item => item.needsReview)
  if (pending.length) {
    const details = pending.map(item => `${item.id} (${item.state})`).join(', ')
    throw new Error(`Upgrade transaction needs review before continuing: ${details}`)
  }
}
