import type { DependencyApplyResult, DependencyFixPlan } from '../../types/dependencies'
import { isDeepStrictEqual } from 'node:util'
import { clearWorkspaceCache } from '../../core/workspace'
import { localize } from '../../i18n'
import { inspectDependencyPlanInputs, validateDependencyPlan } from './guard'
import { dependencyNextSteps, prepareDependencyFix } from './plan'
import { scanDependencies } from './scan'
import { writeDependencyTransaction } from './transaction'

export async function applyDependencyFixPlan(cwd: string, plan: DependencyFixPlan): Promise<DependencyApplyResult> {
  validateDependencyPlan(plan)
  const scan = await scanDependencies(cwd)
  if (inspectDependencyPlanInputs(scan, plan)) {
    return { status: 'unchanged', changed: [], nextSteps: [...dependencyNextSteps] }
  }
  const prepared = prepareDependencyFix(scan, plan.selection)
  if (!isDeepStrictEqual(prepared.plan.files, plan.files)) {
    throw new Error(localize('The proposed changes no longer match the selected dependency policy.', '计划中的变更不再符合所选依赖策略。'))
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
