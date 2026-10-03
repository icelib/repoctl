import type { TemplateDefinition } from '@icebreakers/monorepo-templates'
import type { TemplateCatalogEntry } from '../../core/template-catalog'
import type { templateMap } from '../../core/template-catalog/definitions'
import process from 'node:process'
import { suggestTemplateKey } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import fs from '@/utils/fs'
import { createTemplateCatalog } from '../../core/template-catalog'
import { loadTemplateCatalogContext } from '../../core/template-catalog/config'

export { getCreateChoices, getTemplateMap, templateMap } from '../../core/template-catalog/definitions'

export type CreateNewProjectType = keyof typeof templateMap

export interface CreateNewProjectOptions {
  /**
   * 目标项目名。
   * 未提供时使用模板映射中的 `target`。
   * @default undefined
   */
  name?: string
  /**
   * 生成目标的工作目录。
   * @default process.cwd()
   */
  cwd?: string
  /**
   * 是否把模板里的 `package.json` 输出为 `package.mock.json`。
   * @default false
   */
  renameJson?: boolean
  /**
   * 模板类型。
   * 未提供时优先读取 `commands.create.defaultTemplate`，最后回退到 `'tsdown'`。
   * @default 'tsdown'
   */
  type?: CreateNewProjectType | string
}

export interface CreateNewProjectPlan {
  cwd: string
  requestedTemplate: string
  template: string
  usedFallback: boolean
  sourceDir: string
  targetName: string
  targetDir: string
  targetExists: boolean
  renameJson: boolean
  hasPackageJson: boolean
  packageJsonFileName: 'package.json' | 'package.mock.json'
  packageName: string
  templateDefinition: TemplateDefinition
  templateInfo: TemplateCatalogEntry
}

/**
 * `createNewProject()` 默认使用的模板类型。
 * @default 'tsdown'
 */
export const defaultTemplate: CreateNewProjectType = 'tsdown'

function formatUnknownTemplateError(template: string, availableTemplates: string[]) {
  const suggestion = suggestTemplateKey(template, { keys: availableTemplates })
  const suggestionText = suggestion ? `你是不是想用 ${suggestion}？ ` : ''
  return `未知模板：${template}。${suggestionText}可用模板：${availableTemplates.join(', ')}`
}

export async function resolveCreateNewProjectPlan(options?: CreateNewProjectOptions): Promise<CreateNewProjectPlan> {
  const cwd = options?.cwd ?? process.cwd()
  const context = await loadTemplateCatalogContext({ cwd })
  const createConfig = context.createConfig
  const catalog = createTemplateCatalog(context)

  const renameJson = options?.renameJson ?? createConfig?.renameJson ?? false
  const rawName = options?.name ?? createConfig?.name
  const name = typeof rawName === 'string' ? rawName.trim() : undefined
  const requestedTemplate = options?.type ?? createConfig?.type ?? createConfig?.defaultTemplate ?? defaultTemplate

  const requestedTemplateName = String(requestedTemplate)
  const invalid = catalog.diagnostics.find(item => item.status === 'fail' && (!item.template || item.template === requestedTemplateName))
  if (invalid) {
    throw new Error(`${invalid.configFile ?? 'repoctl.config'}:${invalid.configPath}: ${invalid.detail}`)
  }
  const templateInfo = catalog.entries.find(entry => entry.key === requestedTemplateName)
  if (!templateInfo) {
    throw new Error(formatUnknownTemplateError(requestedTemplateName, catalog.entries.map(entry => entry.key).sort()))
  }
  const template = templateInfo.key
  const templateDefinition = { source: templateInfo.source, target: templateInfo.target }
  const sourceDir = templateInfo.sourceDir
  const targetName = name && name.length > 0 ? name : templateDefinition.target
  const targetDir = path.join(cwd, targetName)
  const sourceJsonPath = path.resolve(sourceDir, 'package.json')
  const hasPackageJson = await fs.pathExists(sourceJsonPath)
  const packageJsonFileName = renameJson ? 'package.mock.json' : 'package.json'
  const packageName = name?.startsWith('@') ? name : path.basename(targetName)

  return {
    cwd,
    requestedTemplate: requestedTemplateName,
    template,
    usedFallback: requestedTemplateName !== template,
    sourceDir,
    targetName,
    targetDir,
    targetExists: await fs.pathExists(targetDir),
    renameJson,
    hasPackageJson,
    packageJsonFileName,
    packageName,
    templateDefinition,
    templateInfo,
  }
}
