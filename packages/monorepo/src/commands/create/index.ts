import type { CreateNewProjectOptions } from './plan'
import path from 'pathe'
import pc from 'picocolors'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import { resolveCreateNewProjectPlan } from './plan'
import { executeCreatePlan } from './transaction'

export * from './plan'
export { inspectCreateTarget, recoverCreateTarget } from './recovery'
export type { CreateTargetInspection, CreateTargetInspectionStatus, CreateTargetMarker, RecoverCreateTargetOptions, RecoverCreateTargetResult } from './recovery'
export type { CreateManifestRecoveryResult } from './recovery/manifest'

/** Generate a validated template and register its exact workspace path. */
export async function createNewProject(options?: CreateNewProjectOptions) {
  const plan = await resolveCreateNewProjectPlan(options)
  if (plan.targetExists) {
    throw new Error(`${pc.red(localize('Target directory already exists', '目标目录已存在'))}: ${path.relative(plan.cwd, plan.targetDir)}`)
  }
  await executeCreatePlan(plan)
  logger.success(localize(`${pc.bgGreenBright(pc.white(`[${plan.template}]`))} Created ${plan.targetName}.`, `${pc.bgGreenBright(pc.white(`[${plan.template}]`))} ${plan.targetName} 项目创建成功！`))
}
