import type { CreateNewProjectOptions } from './plan'
import { createTemplateInstanceTarget, instanceRelativePath, prepareTemplateInstanceSource, recordGeneratedTemplateInstance, snapshotDigest } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import pc from 'picocolors'
import { version } from '../../constants'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import { resolveCreateNewProjectPlan } from './plan'
import { renderCreateNewProject } from './render'
import { updateWorkspaceManifest } from './workspace'

export * from './plan'

/** Create files first and atomically register provenance only after every transformation succeeds. */
export async function createNewProject(options?: CreateNewProjectOptions) {
  const plan = await resolveCreateNewProjectPlan(options)
  if (plan.targetExists) {
    throw new Error(`${pc.red(localize('Target directory already exists', '目标目录已存在'))}: ${path.relative(plan.cwd, plan.targetDir)}`)
  }
  const target = instanceRelativePath(plan.cwd, plan.targetDir)
  const preparedSource = await prepareTemplateInstanceSource(plan.sourceDir)
  await createTemplateInstanceTarget(plan.cwd, target)
  await renderCreateNewProject(plan)
  await updateWorkspaceManifest(plan.cwd, plan.targetName)
  try {
    const currentSource = await prepareTemplateInstanceSource(plan.sourceDir)
    if (snapshotDigest(currentSource.snapshot) !== snapshotDigest(preparedSource.snapshot)) {
      throw new Error('Template source changed while generating the project.')
    }
    await recordGeneratedTemplateInstance({
      workspaceDir: plan.cwd,
      targetDir: plan.targetDir,
      template: plan.template,
      preparedSource,
      profile: 'repo-new-v1',
      parameters: { packageName: plan.packageName, renameJson: plan.renameJson },
      generatorVersion: version,
    })
  }
  catch (error) {
    throw new Error(`Generated project remains at ${plan.targetDir}, but provenance registration failed. Registry recovery path: ${path.join(plan.cwd, '.repoctl/template-instances.json')}. Inspect the error and use repo templates link ${target} --template ${plan.template} to recover an explicit association.`, { cause: error })
  }
  logger.success(localize(`${pc.bgGreenBright(pc.white(`[${plan.template}]`))} Created ${plan.targetName}.`, `${pc.bgGreenBright(pc.white(`[${plan.template}]`))} ${plan.targetName} 项目创建成功！`))
}
