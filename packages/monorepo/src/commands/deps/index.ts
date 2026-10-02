import type { DependencyFixOptions } from '../../types/dependencies'
import { prepareDependencyFix } from './plan'
import { dependencyReport } from './report'
import { scanDependencies } from './scan'

export async function checkDependencies(cwd: string) {
  return dependencyReport(await scanDependencies(cwd))
}

export async function planDependencyFix(cwd: string, options: DependencyFixOptions) {
  return prepareDependencyFix(await scanDependencies(cwd), options).plan
}

export { applyDependencyFixPlan } from './apply'
