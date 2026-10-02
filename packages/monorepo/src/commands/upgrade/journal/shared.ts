import type { Buffer } from 'node:buffer'
import type { UpgradeFileIdentity, UpgradeOperation } from '../types'
import type { UpgradeJournalOperation, UpgradeTransactionHandle, UpgradeTransactionJournal } from './types'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, rename, rm, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { upgradeJournalSchemaVersion } from './types'

export function hash(data: Buffer | undefined) {
  return data === undefined ? null : createHash('sha256').update(data).digest('hex')
}

export function relativeUpgradeOperationPath(targetDir: string, targetPath: string) {
  const relative = path.relative(path.resolve(targetDir), path.resolve(targetPath))
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Upgrade journal target escapes workspace: ${targetPath}`)
  }
  return relative.split(path.sep).join('/')
}

export async function writeAtomic(targetPath: string, content: string) {
  const temporary = `${targetPath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content, 'utf8')
    await rename(temporary, targetPath)
  }
  catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

export async function persist(handle: UpgradeTransactionHandle) {
  handle.journal.updatedAt = Date.now()
  await writeAtomic(handle.journalPath, `${JSON.stringify(handle.journal, undefined, 2)}\n`)
}

export async function pathExists(target: string) {
  try {
    await lstat(target)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

export function isIdentity(value: unknown): value is UpgradeFileIdentity {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Number.isSafeInteger((value as UpgradeFileIdentity).dev) && (value as UpgradeFileIdentity).dev >= 0
    && Number.isSafeInteger((value as UpgradeFileIdentity).ino) && (value as UpgradeFileIdentity).ino >= 0
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isJournalOperation(value: unknown): value is UpgradeJournalOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const entry = value as Partial<UpgradeJournalOperation>
  const validBackup = entry.backup === undefined || (
    typeof entry.backup === 'string'
    && /^backups\/[^/]+$/u.test(entry.backup)
    && !entry.backup.includes('\\')
  )
  return typeof entry.path === 'string'
    && entry.path.length > 0
    && !entry.path.includes('\\')
    && !entry.path.startsWith('/')
    && !entry.path.split('/').includes('..')
    && !entry.path.split('/').includes('')
    && typeof entry.beforeExists === 'boolean'
    && typeof entry.afterExists === 'boolean'
    && isSafeNonNegativeInteger(entry.beforeBytes)
    && isSafeNonNegativeInteger(entry.afterBytes)
    && (entry.beforeHash === null || isHash(entry.beforeHash))
    && (entry.afterHash === null || isHash(entry.afterHash))
    && (entry.beforeIdentity === undefined || isIdentity(entry.beforeIdentity))
    && (entry.afterIdentity === undefined || isIdentity(entry.afterIdentity))
    && (entry.mode === undefined || Number.isSafeInteger(entry.mode))
    && validBackup
    && typeof entry.applied === 'boolean'
}

export function isJournal(value: unknown): value is UpgradeTransactionJournal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const journal = value as Partial<UpgradeTransactionJournal>
  return journal.schemaVersion === upgradeJournalSchemaVersion
    && typeof journal.id === 'string' && journal.id.length > 0 && !journal.id.includes('/') && !journal.id.includes('\\')
    && isSafeNonNegativeInteger(journal.pid)
    && typeof journal.targetDir === 'string' && journal.targetDir.length > 0
    && Number.isFinite(journal.createdAt)
    && Number.isFinite(journal.updatedAt)
    && (journal.state === 'applying' || journal.state === 'completed' || journal.state === 'needs-review')
    && Array.isArray(journal.operations)
    && journal.operations.every(operation => isJournalOperation(operation))
    && (journal.error === undefined || typeof journal.error === 'string')
}

export function validateUpgradeOperations(targetDir: string, operations: UpgradeOperation[]) {
  return operations.map(operation => relativeUpgradeOperationPath(targetDir, operation.targetPath))
}
