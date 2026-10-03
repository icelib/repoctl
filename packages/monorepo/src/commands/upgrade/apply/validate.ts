import type { UpgradePlan } from '../../../types/upgrade'
import { writesAsset } from '../baseline/apply'
import { validateMigrationPlan } from '../migrations/validate'
import { validateUpgradePlanFiles } from './schema'

export const actionable = (file: UpgradePlan['files'][number]) => writesAsset(file) || Boolean(file.baseline)

export function validateUpgradePlan(plan: UpgradePlan) {
  validateUpgradePlanFiles(plan)
  validateMigrationPlan(plan)
}
