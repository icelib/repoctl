import type { UpgradeContext } from '../plan/context'
import type { MigrationAttempt } from './record'
import { Buffer } from 'node:buffer'
import { validateUpgradePlanFiles } from '../apply/schema'
import { upgradeOperations } from '../baseline/apply'
import { hash } from '../plan/files'
import { migrationGroup } from './record'

/** Resume exact reviewed bytes only; arbitrary intervening edits are never adopted. */
export async function planMigrationRecovery(context: UpgradeContext, attempt: MigrationAttempt) {
  validateUpgradePlanFiles({ schemaVersion: 1, cwd: context.plan.cwd, rootDir: context.plan.rootDir, assetDir: context.plan.assetDir, status: 'ready', targets: [], discovery: attempt.discovery, files: attempt.files, inputs: attempt.inputs, blockers: [] })
  const operations = upgradeOperations(attempt.files)
  const states = new Map<string, 'before' | 'after'>()
  for (const input of attempt.inputs) {
    const current = await context.read(input.area, input.path)
    const currentHash = current === null ? null : hash(current)
    const operation = input.area === 'target' ? operations.find(file => file.path === input.path) : undefined
    if (operation && currentHash === operation.afterHash) {
      states.set(input.path, 'after')
    }
    else if (currentHash === input.hash) {
      if (operation) {
        states.set(input.path, 'before')
      }
    }
    else {
      context.plan.blockers.push({ id: 'migration-recovery-conflict', path: input.path, detail: `The interrupted migration input changed. Preserve local edits and review any ${input.path}.repoctl-upgrade-${attempt.id}.bak backup before retrying.` })
    }
  }
  const cleanup: string[] = []
  for (const file of operations) {
    for (const [extension, expected] of [['bak', file.beforeHash], ['tmp', file.afterHash]] as const) {
      const filename = `${file.path}.repoctl-upgrade-${attempt.id}.${extension}`
      const content = await context.read('target', filename)
      if (content === null) {
        continue
      }
      if (hash(content) !== expected) {
        context.plan.blockers.push({ id: 'migration-backup-conflict', path: filename, detail: 'The retained recovery file does not match the reviewed journal. Preserve it for manual inspection.' })
      }
      else {
        cleanup.push(filename)
      }
    }
  }
  if (context.plan.blockers.length) {
    return []
  }
  context.plan.discovery = attempt.discovery
  for (const original of attempt.files) {
    const after = original.beforeHash === original.afterHash ? await context.read('target', original.path) : original.content === null ? null : Buffer.from(original.content, 'base64')
    const reason = original.reason === 'migration-recovery-cleanup' ? original.reason : `migration-recovery-${states.get(original.path) ?? 'before'}`
    const file = await context.put(original.path, after, reason, 'Resume the previously reviewed migration output.', { force: true, group: original.group! })
    // An identical original entry can still carry a baseline change.
    if (original.beforeHash === original.afterHash) {
      file.status = 'identical'
      file.content = null
      file.afterHash = file.beforeHash
    }
    if (original.baseline && states.get(original.baseline.path) !== 'after') {
      file.baseline = { ...original.baseline }
    }
  }
  for (const filename of cleanup) {
    await context.put(filename, null, 'migration-recovery-cleanup', 'Remove the verified original backup or staged output only with the completed recovery transaction.', { force: true, group: migrationGroup })
  }
  return [...states].map(([path, state]) => ({ path, state }))
}
