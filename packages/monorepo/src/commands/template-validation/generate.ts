import type { TemplateValidationPlan } from './types'
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { scaffoldWorkspace } from '@icebreakers/monorepo-templates'
import { applyCreateNewProjectPlan } from '../create'

export async function generateValidationSample(plan: TemplateValidationPlan, workspace: string, name: string) {
  await scaffoldWorkspace({ targetDir: workspace, assetsDir: plan.fixtureDir })
  const manifestPath = path.join(workspace, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.name = `template-validation-${name}`
  manifest.private = true
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const targetName = `packages/${name}`
  const targetDir = path.join(workspace, targetName)
  const definition = { source: plan.sourceResolution?.request.templatePath ?? plan.sourceDir, target: targetName }
  await applyCreateNewProjectPlan({
    cwd: workspace,
    requestedTemplate: plan.template,
    template: plan.template,
    usedFallback: false,
    sourceDir: plan.sourceDir,
    targetName,
    targetDir,
    targetExists: await access(targetDir).then(() => true).catch(() => false),
    renameJson: false,
    hasPackageJson: true,
    packageJsonFileName: 'package.json',
    packageName: name,
    templateDefinition: definition,
    templateInfo: { ...definition, key: plan.template, label: plan.template, sourceDir: plan.sourceDir, origin: 'custom', overridesBuiltin: false, configFile: null },
    ...(plan.sourceResolution ? { sourceResolution: plan.sourceResolution } : {}),
  }, false)
  return targetDir
}
