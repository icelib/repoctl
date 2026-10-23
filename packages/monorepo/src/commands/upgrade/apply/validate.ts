import type { UpgradePlan } from '../../../types/upgrade'
import { writesAsset } from '../baseline/apply'
import { validateMigrationPlan } from '../migrations/validate'
import { validateWorkspacePolicyExpiry } from '../workspace/decisions'
import { validateUpgradePlanFiles } from './schema'

export const actionable = (file: UpgradePlan['files'][number]) => writesAsset(file) || Boolean(file.baseline)

export function blockedUpgradeGroups(plan: UpgradePlan) {
  return new Set(plan.files.filter(file => file.group && ['conflict', 'skip'].includes(file.status)).map(file => file.group))
}

export function validateUpgradePlan(plan: UpgradePlan) {
  validateUpgradePlanFiles(plan)
  validateMigrationPlan(plan)
  validateWorkspacePolicyExpiry(plan)
}
