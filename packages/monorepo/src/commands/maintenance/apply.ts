import type { MaintenanceUpgradeReport } from './types'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { applyOrganizationPresetAssets } from '../../core/presets/asset-plan/apply'
import { planOrganizationPresetAssets } from '../../core/presets/asset-plan/plan'
import { applyUpgradePlan } from '../upgrade'
import { upgradeOperations } from '../upgrade/baseline/apply'

/** Reconcile only inputs written by the reviewed root plan; preset outcomes remain immutable. */
export async function applyMaintenancePlans(cwd: string, report: MaintenanceUpgradeReport) {
  const presetPlan = report.presets?.plan
  const rootChanged = report.plan ? (await applyUpgradePlan(cwd, report.plan)).status !== 'unchanged' : false
  const presetChanged = presetPlan?.files.some(file => file.beforeHash !== file.afterHash) ?? false
  if (presetChanged && presetPlan) {
    let applyPlan = presetPlan
    if (rootChanged) {
      const fresh = await planOrganizationPresetAssets(cwd, presetPlan.targets)
      const { inputs: before, ...reviewed } = presetPlan
      const { inputs: after, ...replanned } = fresh
      if (!isDeepStrictEqual(reviewed, replanned) || before.length !== after.length) {
        throw new Error('Root upgrade changed preset outcomes; review the combined upgrade manually.')
      }
      const operations = new Map(upgradeOperations(report.plan!.files).map(file => [path.resolve(cwd, file.path), file]))
      for (const [index, next] of after.entries()) {
        const previous = before[index]!
        const operation = operations.get(next.path)
        if (previous.path !== next.path || (previous.hash !== next.hash
          && (!operation || operation.beforeHash !== previous.hash || operation.afterHash !== next.hash))) {
          throw new Error('Preset input changed outside the reviewed root upgrade.')
        }
      }
      applyPlan = fresh
    }
    await applyOrganizationPresetAssets(applyPlan)
  }
  // Pure preset baseline version bookkeeping does not create a maintenance PR.
  return rootChanged || presetChanged
}
