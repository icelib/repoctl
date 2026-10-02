import { applyUpgradePlan } from '../apply'
import { planUpgrade } from '../plan'

export { classifyReleaseWorkflow, isLegacyReleaseWorkflow, releaseWorkflowMarker } from './classify'
export type { ReleaseWorkflowStatus } from './classify'

/** Compatibility helper; migration uses the same reviewed plan and transaction. */
export async function migrateLegacyVersioning(workspaceDir: string) {
  const plan = await planUpgrade({ cwd: workspaceDir, targets: [], yes: true })
  if (plan.status === 'blocked') {
    throw new Error(plan.blockers.map(item => item.detail).join('\n'))
  }
  await applyUpgradePlan(plan.cwd, plan)
  return { migratedLane: plan.files.some(file => file.path === '.changeset/pre.json' && file.status === 'delete') }
}
