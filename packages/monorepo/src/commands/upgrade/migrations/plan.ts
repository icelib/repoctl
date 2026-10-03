import type { UpgradeMigrationStep } from '../../../types/upgrade'
import type { UpgradeContext } from '../plan/context'
import type { MigrationAttempt, MigrationLedger } from './record'
import type { MigrationDefinition } from './registry'
import { Buffer } from 'node:buffer'
import path from 'pathe'
import { compare, gt, valid } from 'semver'
import { actionable } from '../apply/validate'
import { hash } from '../plan/files'
import { encodeLedger, ledgerPath, migrationGroup, parseLedger } from './record'
import { planMigrationRecovery } from './recovery'
import { migrationRegistry, selectMigrations } from './registry'

function transition(ledger: MigrationLedger, steps: UpgradeMigrationStep[], fromVersion: string | null, toVersion: string, status: 'pending' | 'completed' | 'failed', attempt: MigrationAttempt): MigrationLedger {
  const entries = { ...ledger.entries }
  for (const step of steps.filter(step => step.status === 'pending' || step.status === 'failed')) {
    entries[step.id] = { version: step.version, status, fromVersion, toVersion }
  }
  return { schemaVersion: 1, evaluatedVersion: status === 'completed' ? toVersion : ledger.evaluatedVersion, entries, attempt: status === 'completed' ? null : attempt }
}

export async function planMigrations(context: UpgradeContext, registry: readonly MigrationDefinition[] = migrationRegistry) {
  const { plan, read, options } = context
  const metadata = await read('config', path.resolve(plan.assetDir, '../package.json'))
  const toVersion = metadata && (JSON.parse(metadata.toString()) as { version?: unknown }).version
  if (typeof toVersion !== 'string' || valid(toVersion) !== toVersion) {
    throw new Error('The installed template package has no exact migration version.')
  }
  const ledger = parseLedger(await read('target', ledgerPath))
  const supplied = options.fromVersion === undefined ? null : valid(options.fromVersion)
  if (options.fromVersion !== undefined && (!supplied || supplied !== options.fromVersion)) {
    throw new Error('fromVersion must be an exact semver version, never a range.')
  }
  if (supplied && ledger.evaluatedVersion && supplied !== ledger.evaluatedVersion) {
    throw new Error('fromVersion conflicts with the migration evaluation cursor.')
  }
  const priorAttempt = Object.values(ledger.entries).find(entry => entry.status !== 'completed')
  if (supplied && ledger.attempt && supplied !== priorAttempt?.fromVersion) {
    throw new Error('fromVersion conflicts with the interrupted migration source version.')
  }
  const fromVersion = ledger.attempt ? priorAttempt?.fromVersion ?? null : ledger.evaluatedVersion ?? supplied
  if (fromVersion && gt(fromVersion, toVersion)) {
    throw new Error(`Migration downgrade is not supported: ${fromVersion} -> ${toVersion}.`)
  }
  const steps: UpgradeMigrationStep[] = []
  plan.migrations = { fromVersion, toVersion, steps, recovery: [] }
  if (ledger.attempt) {
    if (Object.values(ledger.entries).some(entry => entry.status !== 'completed' && entry.toVersion !== toVersion)) {
      throw new Error('Resume the interrupted migration with its original template package version before upgrading further.')
    }
    for (const [id, entry] of Object.entries(ledger.entries).sort(([leftId, left], [rightId, right]) => compare(left.version, right.version) || leftId.localeCompare(rightId))) {
      steps.push({ id, version: entry.version, status: entry.status, reason: entry.status === 'completed' ? 'already-completed' : 'interrupted-migration-recovery', files: ledger.attempt.files.map(file => file.path) })
    }
  }
  else {
    const candidates = selectMigrations(registry, fromVersion, toVersion)
    for (const migration of [...registry].sort((a, b) => compare(a.version, b.version) || a.id.localeCompare(b.id))) {
      const recorded = ledger.entries[migration.id]
      const step: UpgradeMigrationStep = { id: migration.id, version: migration.version, status: recorded?.status === 'completed' ? 'completed' : 'skipped', reason: recorded?.status === 'completed' ? 'already-completed' : 'version-not-crossed', files: [] }
      steps.push(step)
    }
    for (const migration of candidates) {
      const step = steps.find(step => step.id === migration.id)!
      if (step.status === 'completed') {
        continue
      }
      if (!await migration.detect(context)) {
        step.reason = 'legacy-format-not-present'
        continue
      }
      if (options.noOverwrite || options.skipOverwrite) {
        await migration.plan(context)
        step.reason = 'overwrite-disabled'
        continue
      }
      const invalid = await migration.check?.(context)
      if ((fromVersion === null && !migration.adoptUnknown) || invalid) {
        if (invalid) {
          for (const filename of invalid.retain) {
            const content = await read('target', filename)
            if (content !== null) {
              await context.put(filename, content, invalid.reason, invalid.detail, { skip: true })
            }
          }
        }
        step.status = 'blocked'
        step.reason = invalid?.id ?? 'source-version-required'
        plan.blockers.push({ id: step.reason, path: invalid?.path ?? null, detail: invalid?.detail ?? `Migration ${migration.id} requires an exact source version.` })
        continue
      }
      step.files = await migration.plan(context)
      const affected = step.files.map(filename => plan.files.find(file => file.path === filename))
      if (!affected.length || affected.some(file => !file || ['skip', 'conflict'].includes(file.status))) {
        step.status = 'blocked'
        step.reason = 'migration-precondition-failed'
        plan.blockers.push({ id: step.reason, path: null, detail: `Migration ${migration.id} could not plan every required file.` })
      }
      else {
        for (const file of affected) {
          file!.group = migrationGroup
        }
        step.status = 'pending'
        step.reason = fromVersion === null ? 'adopt-detected-legacy-format' : 'version-boundary-crossed'
      }
    }
  }
  return {
    async finalize() {
      if (!plan.migrations || plan.blockers.length || !steps.some(step => step.status === 'pending' || step.status === 'failed')) {
        return
      }
      if (ledger.attempt) {
        plan.migrations.recovery = await planMigrationRecovery(context, ledger.attempt)
        if (plan.blockers.length) {
          return
        }
      }
      const files = plan.files.filter(file => file.group === migrationGroup && (actionable(file) || file.status === 'identical'))
      const inputs = plan.inputs.filter(input => !(input.area === 'target' && input.path === ledgerPath))
      const attempt = { id: hash(Buffer.from(JSON.stringify({ files, inputs, discovery: plan.discovery }))), files: structuredClone(files), inputs: structuredClone(inputs), discovery: structuredClone(plan.discovery) }
      const completed = transition(ledger, steps, fromVersion, toVersion, 'completed', attempt)
      const pending = transition(ledger, steps, fromVersion, toVersion, 'pending', attempt)
      const failed = transition(ledger, steps, fromVersion, toVersion, 'failed', attempt)
      plan.migrations.ledger = { path: ledgerPath, pending: encodeLedger(pending).toString('base64'), failed: encodeLedger(failed).toString('base64') }
      await context.put(ledgerPath, encodeLedger(completed), 'migration-ledger-completed', 'Record successful migration results only after every migration file is applied.', { force: true, group: migrationGroup })
    },
  }
}
