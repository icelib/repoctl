import type { UpgradeOperation } from '../types'
import path from 'pathe'
import { applyUpgradeOperations, readUpgradeFile } from '../files'
import { planLegacyVersioning } from './versioning'

export { planLegacyVersioning } from './versioning'
export type { LegacyVersioningPlan } from './versioning'
export { classifyReleaseWorkflow, hasReleaseWorkflowMarker, isLegacyReleaseWorkflow, releaseWorkflowMarker } from './workflow'
export type { ReleaseWorkflowStatus } from './workflow'

/** Explicit migration entry used internally; upgrade coordinates its authorization separately. */
export async function migrateLegacyVersioning(workspaceDir: string) {
  const plan = await planLegacyVersioning(workspaceDir)
  if (plan.blocked) {
    return { migratedLane: false }
  }
  const operations: UpgradeOperation[] = []
  for (const relativePath of [...(plan.workspaceContent ? ['pnpm-workspace.yaml'] : []), ...plan.remove]) {
    const targetPath = path.join(workspaceDir, relativePath)
    const before = await readUpgradeFile(targetPath)
    operations.push({
      file: { path: relativePath, action: relativePath === 'pnpm-workspace.yaml' ? 'update' : 'delete', reason: 'legacy-release', requiresConfirmation: false, dependsOn: [] },
      targetPath,
      before,
      after: relativePath === 'pnpm-workspace.yaml' ? plan.workspaceContent : undefined,
    })
  }
  await applyUpgradeOperations(workspaceDir, operations)
  return { migratedLane: plan.migratedLane }
}
