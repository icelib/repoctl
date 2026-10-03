import type { TemplateInstanceMovePlan } from '@icebreakers/monorepo-templates'
import { loadTemplateUpgradeJournal } from '../../template-instances/upgrade/transaction/journal'

export async function pendingInstanceUpgrades(root: string, plan: TemplateInstanceMovePlan) {
  const pending: string[] = []
  for (const instance of plan.relocations) {
    if (await loadTemplateUpgradeJournal(root, instance.id)) {
      pending.push(instance.id)
    }
  }
  return pending
}

export async function assertNoPendingInstanceUpgrades(root: string, plan: TemplateInstanceMovePlan) {
  const pending = await pendingInstanceUpgrades(root, plan)
  if (pending.length) {
    throw new Error(`Template instances have pending upgrades. Inspect templates recover-upgrade before moving: ${pending.join(', ')}`)
  }
}
