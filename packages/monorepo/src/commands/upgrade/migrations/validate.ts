import type { UpgradePlan } from '../../../types/upgrade'
import { Buffer } from 'node:buffer'
import { isDeepStrictEqual } from 'node:util'
import { valid } from 'semver'
import { validateUpgradePlanFiles } from '../apply/schema'
import { hash } from '../plan/files'
import { ledgerPath, migrationGroup, parseLedger } from './record'

export function validateMigrationPlan(plan: UpgradePlan) {
  const migration = plan.migrations
  if (!migration) {
    return
  }
  if ((migration.fromVersion !== null && valid(migration.fromVersion) !== migration.fromVersion)
    || valid(migration.toVersion) !== migration.toVersion || !Array.isArray(migration.steps) || !Array.isArray(migration.recovery)
    || migration.steps.some(step => !step || typeof step.id !== 'string' || typeof step.reason !== 'string'
      || valid(step.version) !== step.version || !['pending', 'completed', 'failed', 'skipped', 'blocked'].includes(step.status)
      || !Array.isArray(step.files) || step.files.some(filename => typeof filename !== 'string'))
    || migration.recovery.some(file => !file || typeof file.path !== 'string' || !['before', 'after'].includes(file.state))) {
    throw new Error('Invalid migration plan.')
  }
  if (!migration.ledger) {
    return
  }
  const file = plan.files.find(file => file.path === ledgerPath)
  if (migration.ledger.path !== ledgerPath || !file?.content || file.group !== migrationGroup) {
    throw new Error('Missing completed migration ledger operation.')
  }
  const completed = parseLedger(Buffer.from(file.content, 'base64'))
  const pending = parseLedger(Buffer.from(migration.ledger.pending, 'base64'))
  const failed = parseLedger(Buffer.from(migration.ledger.failed, 'base64'))
  if (!pending.attempt || completed.attempt !== null || !isDeepStrictEqual(pending.attempt, failed.attempt)
    || completed.evaluatedVersion !== migration.toVersion || pending.evaluatedVersion !== failed.evaluatedVersion
    || Object.keys(pending.entries).length !== Object.keys(completed.entries).length
    || Object.keys(failed.entries).length !== Object.keys(completed.entries).length) {
    throw new Error('Inconsistent migration ledger transitions.')
  }
  validateUpgradePlanFiles({ schemaVersion: 1, cwd: plan.cwd, rootDir: plan.rootDir, assetDir: plan.assetDir, status: 'ready', targets: [], discovery: pending.attempt.discovery, files: pending.attempt.files, inputs: pending.attempt.inputs, blockers: [] })
  for (const [id, entry] of Object.entries(completed.entries)) {
    const before = pending.entries[id]
    const failure = failed.entries[id]
    const active = migration.steps.some(step => step.id === id && ['pending', 'failed'].includes(step.status))
    if (!before || !failure || entry.status !== 'completed'
      || before.status !== (active ? 'pending' : 'completed') || failure.status !== (active ? 'failed' : 'completed')
      || !isDeepStrictEqual({ ...entry, status: before.status }, before) || !isDeepStrictEqual({ ...entry, status: failure.status }, failure)) {
      throw new Error(`Invalid migration result transition: ${id}`)
    }
  }
  for (const original of pending.attempt.files) {
    const planned = plan.files.find(file => file.path === original.path)
    if (!planned || planned.group !== migrationGroup || planned.afterHash !== original.afterHash
      || (planned.content !== null && hash(Buffer.from(planned.content, 'base64')) !== original.afterHash)) {
      throw new Error(`Migration output changed since journal review: ${original.path}`)
    }
  }
}
