import type { TemplateUpgradeRecoveryResult } from './types'
import fs from 'node:fs/promises'
import { instanceRelativePath, loadTemplateInstanceRegistry, replaceTemplateInstance, safeInstancePath } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { upgradeDigest } from './digest'
import { restoreUpgradeOperations } from './transaction/files'
import { loadTemplateUpgradeJournal, removeTemplateUpgradeJournal, templateUpgradeJournalPath } from './transaction/journal'
import { readUpgradeFileState, stateMatches } from './transaction/state'

/** Inspect or restore one interrupted operation, retaining every concurrent business edit. */
export async function recoverTemplateUpgrade(cwd: string, selector: string, apply = false): Promise<TemplateUpgradeRecoveryResult> {
  cwd = await fs.realpath(path.resolve(cwd))
  const registry = await loadTemplateInstanceRegistry(cwd)
  const instance = registry.instances.find(item => item.id === selector)
    ?? registry.instances.find(item => item.target === instanceRelativePath(cwd, path.resolve(cwd, selector)))
  if (!instance) {
    throw new Error(`Unknown template instance: ${selector}`)
  }
  const journal = await loadTemplateUpgradeJournal(cwd, instance.id)
  if (!journal) {
    return { schemaVersion: 1 as const, instanceId: instance.id, status: 'no-pending-upgrade' as const, applied: false, files: [] }
  }
  const root = await safeInstancePath(cwd, instance.target)
  const recorded = upgradeDigest(instance)
  const registryStatus = recorded === upgradeDigest(journal.before) ? 'before' : recorded === upgradeDigest(journal.after) ? 'after' : 'conflict'
  const inspect = async () => Promise.all(journal.operations.map(async (operation) => {
    const current = await readUpgradeFileState(root, operation.path)
    return { path: operation.path, state: stateMatches(current, operation.before) ? 'before' as const : stateMatches(current, operation.after) ? 'after' as const : 'conflict' as const }
  }))
  const files = await inspect()
  const conflict = registryStatus === 'conflict' || instance.target !== journal.target || files.some(file => file.state === 'conflict')
  if (!apply) {
    return { schemaVersion: 1 as const, instanceId: instance.id, status: conflict ? 'conflict' as const : 'recoverable' as const, registryStatus, applied: false, files, recoveryPath: templateUpgradeJournalPath(instance.id) }
  }
  if (conflict) {
    throw new Error(`Template recovery would overwrite concurrent changes. Preserve them and inspect ${templateUpgradeJournalPath(instance.id)} before retrying.`)
  }
  await replaceTemplateInstance(cwd, instance, { instance: journal.before, snapshots: {} }, {
    apply: async () => {
      const current = await loadTemplateUpgradeJournal(cwd, instance.id)
      if (current?.digest !== journal.digest || (await inspect()).some(file => file.state === 'conflict')) {
        throw new Error('Template recovery state changed; inspect it again before applying.')
      }
      await restoreUpgradeOperations(root, journal.operations, journal.token)
    },
    rollback: async () => {}, // A partial recovery remains recoverable; never replay the failed upgrade.
    committed: async () => await removeTemplateUpgradeJournal(cwd, journal),
  })
  return { schemaVersion: 1 as const, instanceId: instance.id, status: 'recovered' as const, applied: true, files: await inspect() }
}
