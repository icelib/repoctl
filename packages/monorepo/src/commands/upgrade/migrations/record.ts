import type { UpgradeFilePlan, UpgradeInput } from '../../../types/upgrade'
import { Buffer } from 'node:buffer'
import { gt, valid } from 'semver'
import { hash, relativeFile } from '../plan/files'

export const ledgerPath = '.repoctl/migrations/ledger.json'
export const migrationGroup = 'legacy-versioning'

export interface MigrationRecord {
  version: string
  status: 'pending' | 'completed' | 'failed'
  fromVersion: string | null
  toVersion: string
}

export interface MigrationAttempt {
  id: string
  files: UpgradeFilePlan[]
  inputs: UpgradeInput[]
  discovery: { patterns: string[] | null, manifests: string[] } | null
}

export interface MigrationLedger {
  schemaVersion: 1
  /** A migration evaluation cursor, never a claim about every asset's version. */
  evaluatedVersion: string | null
  entries: Record<string, MigrationRecord>
  attempt: MigrationAttempt | null
}

export const emptyLedger = (): MigrationLedger => ({ schemaVersion: 1, evaluatedVersion: null, entries: {}, attempt: null })
export const encodeLedger = (ledger: MigrationLedger) => Buffer.from(`${JSON.stringify(ledger, null, 2)}\n`)
const version = (value: unknown): value is string => typeof value === 'string' && valid(value) === value

export function parseLedger(content: Buffer | null): MigrationLedger {
  if (content === null) {
    return emptyLedger()
  }
  const ledger = JSON.parse(content.toString()) as MigrationLedger
  if (!ledger || ledger.schemaVersion !== 1 || (ledger.evaluatedVersion !== null && !version(ledger.evaluatedVersion))
    || !ledger.entries || typeof ledger.entries !== 'object' || Array.isArray(ledger.entries)) {
    throw new Error('Invalid migration ledger.')
  }
  for (const [id, entry] of Object.entries(ledger.entries)) {
    if (!/^[a-z][a-z\d-]*$/.test(id) || !entry || !version(entry.version) || !version(entry.toVersion)
      || gt(entry.version, entry.toVersion) || (entry.fromVersion !== null && (!version(entry.fromVersion) || gt(entry.fromVersion, entry.toVersion)))
      || !['pending', 'completed', 'failed'].includes(entry.status)) {
      throw new Error(`Invalid migration record: ${id}`)
    }
  }
  if (ledger.attempt !== null) {
    const attempt = ledger.attempt
    if (!attempt || !/^[\da-f]{64}$/.test(attempt.id) || !Array.isArray(attempt.files) || !Array.isArray(attempt.inputs)
      || !attempt.files.length || new Set(attempt.files.map(file => file.path)).size !== attempt.files.length
      || !Object.values(ledger.entries).some(entry => entry.status !== 'completed')
      || hash(Buffer.from(JSON.stringify({ files: attempt.files, inputs: attempt.inputs, discovery: attempt.discovery }))) !== attempt.id) {
      throw new Error('Invalid migration recovery journal.')
    }
    for (const file of attempt.files) {
      relativeFile(file.path)
      if (file.path === ledgerPath || file.group !== migrationGroup) {
        throw new Error(`Invalid migration recovery path: ${file.path}`)
      }
    }
  }
  else if (Object.values(ledger.entries).some(entry => entry.status !== 'completed')) {
    throw new Error('Pending or failed migration has no recovery journal.')
  }
  else if (Object.values(ledger.entries).some(entry => ledger.evaluatedVersion === null || gt(entry.toVersion, ledger.evaluatedVersion))) {
    throw new Error('Completed migration exceeds the recorded evaluation cursor.')
  }
  return ledger
}
