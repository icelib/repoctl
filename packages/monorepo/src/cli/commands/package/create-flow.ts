import type { CreateNewProjectOptions, CreateNewProjectPlan } from '../../../commands'
import process from 'node:process'
import { input, select } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { createNewProject, getCreateChoices, getTemplateMap, resolveCreateNewProjectPlan } from '../../../commands'
import { defaultTemplate } from '../../../commands/create'
import { resolveCommandConfig } from '../../../core/config'
import { logger } from '../../../core/logger'
import { localize } from '../../../i18n'
import fs from '../../../utils/fs'
import { createIntentChoices } from './intents'

function normalizeTargetName(name: string, baseDir: 'packages' | 'apps') {
  if (name.includes('/')) {
    return name
  }
  return `${baseDir}/${name}`
}

function resolveBaseDirFromTemplate(type: CreateNewProjectOptions['type'], templates: ReturnType<typeof getTemplateMap>) {
  const target = type ? templates[type]?.target : undefined
  const baseDir = target?.split('/')[0]
  return baseDir === 'apps' || baseDir === 'packages' ? baseDir : undefined
}

function normalizeNameForTemplate(name: string, type: CreateNewProjectOptions['type'], templates: ReturnType<typeof getTemplateMap>) {
  if (!type) {
    return name
  }

  const baseDir = resolveBaseDirFromTemplate(type, templates)
  if (!baseDir) {
    return name
  }

  return normalizeTargetName(name, baseDir)
}

export interface RunCreateFlowOptions {
  template?: CreateNewProjectOptions['type']
  dryRun?: boolean
  json?: boolean
  out?: string
}

export interface RunCreateFlowResult {
  dryRun: boolean
  failed?: boolean
}

function formatPlanPath(cwd: string, targetPath: string) {
  const relative = path.relative(cwd, targetPath)
  return relative && relative !== '.' ? relative : targetPath
}

function printCreatePlan(plan: CreateNewProjectPlan) {
  logger.log('')
  logger.log(localize('Create preview:', '创建预览：'))
  logger.log(localize(`  template: ${plan.template}${plan.usedFallback ? ` (fallback from ${plan.requestedTemplate})` : ''}`, `  模板：${plan.template}${plan.usedFallback ? `（从 ${plan.requestedTemplate} 回退）` : ''}`))
  logger.log(localize(`  source: ${formatPlanPath(plan.cwd, plan.sourceDir)}`, `  源目录：${formatPlanPath(plan.cwd, plan.sourceDir)}`))
  logger.log(localize(`  target: ${formatPlanPath(plan.cwd, plan.targetDir)}${plan.targetExists ? ' (already exists)' : ''}`, `  目标目录：${formatPlanPath(plan.cwd, plan.targetDir)}${plan.targetExists ? '（已存在）' : ''}`))
  logger.log(localize(`  package: ${plan.packageName}`, `  包名：${plan.packageName}`))
  logger.log(localize(`  package json: ${plan.hasPackageJson ? plan.packageJsonFileName : 'not included in template'}`, `  package json：${plan.hasPackageJson ? plan.packageJsonFileName : '模板中未包含'}`))
  logger.log(localize(`  workspace manifest: pnpm-workspace.yaml will include ${plan.targetName.includes('/') ? `${plan.targetName.split('/')[0]}/*` : 'packages/*'}`, `  workspace 清单：pnpm-workspace.yaml 将包含 ${plan.targetName.includes('/') ? `${plan.targetName.split('/')[0]}/*` : 'packages/*'}`))
  logger.log('')
  logger.info(localize('Dry run only; no files were written.', '仅执行预览；未写入任何文件。'))
}

function printCreatePlanJson(plan: CreateNewProjectPlan) {
  logger.log(JSON.stringify(plan, null, 2))
}

function formatCreatePlan(plan: CreateNewProjectPlan) {
  return [
    localize('Create preview:', '创建预览：'),
    localize(`  template: ${plan.template}${plan.usedFallback ? ` (fallback from ${plan.requestedTemplate})` : ''}`, `  模板：${plan.template}${plan.usedFallback ? `（从 ${plan.requestedTemplate} 回退）` : ''}`),
    localize(`  source: ${formatPlanPath(plan.cwd, plan.sourceDir)}`, `  源目录：${formatPlanPath(plan.cwd, plan.sourceDir)}`),
    localize(`  target: ${formatPlanPath(plan.cwd, plan.targetDir)}${plan.targetExists ? ' (already exists)' : ''}`, `  目标目录：${formatPlanPath(plan.cwd, plan.targetDir)}${plan.targetExists ? '（已存在）' : ''}`),
    localize(`  package: ${plan.packageName}`, `  包名：${plan.packageName}`),
    localize(`  package json: ${plan.hasPackageJson ? plan.packageJsonFileName : 'not included in template'}`, `  package json：${plan.hasPackageJson ? plan.packageJsonFileName : '模板中未包含'}`),
    localize(`  workspace manifest: pnpm-workspace.yaml will include ${plan.targetName.includes('/') ? `${plan.targetName.split('/')[0]}/*` : 'packages/*'}`, `  workspace 清单：pnpm-workspace.yaml 将包含 ${plan.targetName.includes('/') ? `${plan.targetName.split('/')[0]}/*` : 'packages/*'}`),
    '',
    localize('Dry run only; no files were written.', '仅执行预览；未写入任何文件。'),
  ].join('\n')
}

function canPrompt() {
  return process.stdin.isTTY && process.stdout.isTTY
}

async function emitCreatePlan(plan: CreateNewProjectPlan, options: RunCreateFlowOptions, cwd: string) {
  if (!options.out) {
    if (options.json) {
      printCreatePlanJson(plan)
    }
    else {
      printCreatePlan(plan)
    }
    return
  }

  const content = options.json ? JSON.stringify(plan, null, 2) : formatCreatePlan(plan)
  const outFile = path.resolve(cwd, options.out)
  await fs.outputFile(outFile, `${content}\n`, 'utf8')
  logger.success(localize(`Wrote ${path.relative(cwd, outFile)}`, `已写入 ${path.relative(cwd, outFile)}`))
}

function handleCreateFlowError(error: unknown, json = false): RunCreateFlowResult {
  const message = error instanceof Error ? error.message : String(error)
  if (json) {
    logger.log(JSON.stringify({ error: message }, null, 2))
  }
  else {
    logger.error(message)
  }
  process.exitCode = 1
  return { dryRun: false, failed: true }
}

export async function runCreateFlow(cwd: string, inputName: string | undefined, options: RunCreateFlowOptions = {}) {
  try {
    const createConfig = await resolveCommandConfig('create', cwd)
    const explicitTemplate = options.template ?? createConfig?.type ?? createConfig?.defaultTemplate
    const templates = getTemplateMap(createConfig?.templateMap)

    let packageName = inputName

    if (!explicitTemplate && !canPrompt()) {
      const type = defaultTemplate
      const createOptions = {
        name: normalizeNameForTemplate(packageName ?? createConfig?.name ?? 'my-package', type, templates),
        cwd,
        type,
      }

      if (options.dryRun) {
        const plan = await resolveCreateNewProjectPlan(createOptions)
        await emitCreatePlan(plan, options, cwd)
        return { dryRun: true }
      }

      await createNewProject(createOptions)
      return { dryRun: false }
    }

    if (!explicitTemplate) {
      const intent = await select({
        message: localize('What do you want to create?', '你要创建什么？'),
        choices: createIntentChoices,
        default: 'library',
      })
      const intentChoice = createIntentChoices.find(item => item.value === intent)
      if (!intentChoice) {
        throw new Error(localize(`Unknown create intent: ${intent}`, `未找到创建意图：${intent}`))
      }

      if (!packageName) {
        packageName = await input({
          message: localize('Enter a name', '请输入名称'),
          default: 'my-module',
        })
      }

      let type: CreateNewProjectOptions['type'] = intentChoice.defaultTemplate
      if (intent === 'library') {
        type = await select({
          message: localize('Select a library template', '请选择库模板'),
          choices: [
            { name: 'TypeScript Library', value: 'tsdown', description: localize('General-purpose TypeScript library', '通用 TypeScript 库') },
            { name: 'Vue Component Library', value: 'vue-lib', description: localize('Vue component library', 'Vue 组件库') },
          ],
          default: 'tsdown',
        })
      }

      const createOptions = {
        name: normalizeNameForTemplate(packageName, type, templates),
        cwd,
        ...(type !== undefined ? { type } : {}),
      }

      if (options.dryRun) {
        const plan = await resolveCreateNewProjectPlan(createOptions)
        await emitCreatePlan(plan, options, cwd)
        return { dryRun: true }
      }

      await createNewProject(createOptions)
      return { dryRun: false }
    }

    if (!packageName && !canPrompt()) {
      packageName = createConfig?.name ?? 'my-package'
    }
    else if (!packageName) {
      packageName = await input({
        message: localize('Enter the package name', '请输入包名'),
        default: createConfig?.name ?? 'my-package',
      })
    }

    const type: CreateNewProjectOptions['type'] = explicitTemplate ?? await select({
      message: localize('Select a template type', '请选择模板类型'),
      choices: getCreateChoices(createConfig?.choices),
      default: defaultTemplate,
    })

    const createOptions = {
      name: normalizeNameForTemplate(packageName, type, templates),
      cwd,
      ...(type !== undefined ? { type } : {}),
    }

    if (options.dryRun) {
      const plan = await resolveCreateNewProjectPlan(createOptions)
      await emitCreatePlan(plan, options, cwd)
      return { dryRun: true }
    }

    await createNewProject(createOptions)
    return { dryRun: false }
  }
  catch (error) {
    return handleCreateFlowError(error, options.json)
  }
}
