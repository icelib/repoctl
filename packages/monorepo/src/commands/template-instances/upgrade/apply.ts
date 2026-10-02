import type { TemplateUpgradeJournal } from './transaction/journal'
import type { TemplateUpgradePlan, TemplateUpgradeResult } from './types'
import { loadTemplateInstanceRegistry, replaceTemplateInstance, safeInstancePath, snapshotDigest } from '@icebreakers/monorepo-templates'
import { captureUpgradeTarget } from './current'
import { upgradeDigest } from './digest'
import { prepareTemplateUpgrade } from './plan'
import { applyUpgradeOperation, restoreUpgradeOperations } from './transaction/files'
import { createTemplateUpgradeJournal, removeTemplateUpgradeJournal, templateUpgradeJournalPath } from './transaction/journal'

export async function applyTemplateUpgradePlan(plan: TemplateUpgradePlan): Promise<TemplateUpgradeResult> {
  const { fingerprint, ...content } = plan
  const current = await prepareTemplateUpgrade(plan.options)
  if (upgradeDigest(content) !== fingerprint || current.plan.fingerprint !== fingerprint) {
    throw new Error('Template upgrade plan is stale or was edited; preview the current instance again.')
  }
  if (current.plan.action === 'conflict') {
    throw new Error('Template upgrade has unresolved conflicts. Resolve or explicitly exclude those paths before applying.')
  }
  const result = { schemaVersion: 1 as const, instanceId: current.previous.id, target: current.previous.target }
  if (current.plan.action === 'unchanged') {
    return { ...result, status: 'unchanged', changed: [] }
  }
  const cwd = current.plan.options.cwd
  const root = await safeInstancePath(cwd, current.previous.target)
  let journal: TemplateUpgradeJournal | undefined
  await replaceTemplateInstance(cwd, current.previous, current.draft, {
    apply: async () => {
      if (upgradeDigest(await loadTemplateInstanceRegistry(cwd)) !== current.plan.registryDigest
        || snapshotDigest(await captureUpgradeTarget(root, current.plan.changes.map(item => item.path), current.plan.options.exclude)) !== current.plan.targetDigest) {
        throw new Error('Template upgrade plan became stale before the registry lock was acquired; preview again.')
      }
      journal = await createTemplateUpgradeJournal(current.plan, current.previous)
      for (const operation of journal.operations) {
        await applyUpgradeOperation(root, operation, journal.token)
      }
    },
    rollback: async () => {
      if (journal) {
        await restoreUpgradeOperations(root, journal.operations, journal.token)
        await removeTemplateUpgradeJournal(cwd, journal)
      }
    },
    committed: async () => {
      if (journal) {
        try {
          await removeTemplateUpgradeJournal(cwd, journal)
        }
        catch (error) {
          throw new Error(`Template upgrade was applied, but its recovery record could not be removed: ${templateUpgradeJournalPath(current.previous.id)}. Inspect templates recover-upgrade before another update.`, { cause: error })
        }
      }
    },
  }).catch((error: unknown) => {
    if (error instanceof AggregateError && journal) {
      throw new Error(`Template upgrade failed and recovery is incomplete. Preserve ${templateUpgradeJournalPath(current.previous.id)} and inspect templates recover-upgrade ${current.previous.id}.`, { cause: error })
    }
    throw error
  })
  return { ...result, status: 'applied', changed: current.plan.changes.filter(item => ['add', 'modify', 'delete'].includes(item.status)).map(item => item.path) }
}
