import type { CatalogMigrationPlan } from '../../../types/catalogs'
import type { DependencyApplyResult } from '../../../types/dependencies'
import { isDeepStrictEqual } from 'node:util'
import { clearWorkspaceCache } from '../../../core/workspace'
import { inspectDependencyPlanInputs, validateDependencyPlan } from '../guard'
import { dependencyNextSteps } from '../plan'
import { scanDependencies } from '../scan'
import { writeDependencyTransaction } from '../transaction'
import { prepareCatalogMigration } from './plan'

export async function applyCatalogMigrationPlan(cwd: string, plan: CatalogMigrationPlan): Promise<DependencyApplyResult> {
  validateDependencyPlan(plan)
  if (plan.kind !== 'catalog-migration' || !Array.isArray(plan.consumers)) {
    throw new Error('Invalid catalog migration plan.')
  }
  const scan = await scanDependencies(cwd)
  if (inspectDependencyPlanInputs(scan, plan)) {
    return { status: 'unchanged', changed: [], nextSteps: [...dependencyNextSteps] }
  }
  const prepared = prepareCatalogMigration(scan, plan.selection)
  if (!isDeepStrictEqual(prepared.plan.files, plan.files) || !isDeepStrictEqual(prepared.plan.consumers, plan.consumers)) {
    throw new Error('The catalog migration no longer matches the reviewed declarations and YAML changes.')
  }
  if (!prepared.updates.length) {
    return { status: 'unchanged', changed: [], nextSteps: [...dependencyNextSteps] }
  }
  try {
    await writeDependencyTransaction(scan.workspaceDir, prepared.updates)
  }
  finally {
    clearWorkspaceCache()
  }
  return { status: 'applied', changed: plan.files.map(file => file.path), nextSteps: [...dependencyNextSteps] }
}
