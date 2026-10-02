import type { TemplateDefinition } from '@icebreakers/monorepo-templates'
import type { CreateWorkspaceManifestPlan } from './workspace'
import type { CreateChoiceOption } from '@/types'
import process from 'node:process'
import { suggestTemplateKey, templateChoices } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { templatesDir as defaultTemplatesDir } from '../../constants'
import { resolveCommandConfig } from '../../core/config'
import { localize } from '../../i18n'
import { pathEntryExists, validateCreateSource, validateCreateTarget } from './validation'
import { prepareWorkspaceManifest } from './workspace'

/**
 * 内置模板映射表，source 指向 templates 根目录下的来源目录，target 为生成路径。
 */
export const templateMap = {
  'tsdown': { source: 'tsdown', target: 'packages/tsdown' },
  'vue-lib': { source: 'vue-lib', target: 'packages/vue-lib' },
  'hono-server': { source: 'server', target: 'apps/server' },
  'vue-hono': { source: 'client', target: 'apps/client' },
  'vitepress': { source: 'vitepress', target: 'apps/website' },
  'cli': { source: 'cli', target: 'apps/cli' },
} as const

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
  workspaceManifest: CreateWorkspaceManifestPlan
}

/**
 * `createNewProject()` 默认使用的模板类型。
 * @default 'tsdown'
 */
export const defaultTemplate: CreateNewProjectType = 'tsdown'

const baseChoices: CreateChoiceOption[] = templateChoices.map((choice) => {
  const option: CreateChoiceOption = {
    name: choice.label,
    value: choice.key,
  }
  if (choice.description) {
    option.description = choice.description
  }
  return option
})

function normalizeTemplateDefinition(value: string | TemplateDefinition) {
  if (typeof value === 'string') {
    return { source: value, target: value }
  }
  return value
}

function formatUnknownTemplateError(template: string, availableTemplates: string[]) {
  const suggestion = suggestTemplateKey(template, { keys: availableTemplates })
  const suggestionText = suggestion ? `你是不是想用 ${suggestion}？ ` : ''
  return `未知模板：${template}。${suggestionText}可用模板：${availableTemplates.join(', ')}`
}

export function getCreateChoices(choices?: CreateChoiceOption[]) {
  if (choices?.length) {
    return choices
  }
  return [...baseChoices]
}

export function getTemplateMap(extra?: Record<string, string | TemplateDefinition>) {
  const base: Record<string, TemplateDefinition> = Object.fromEntries(
    Object.entries(templateMap).map(([key, value]) => [key, normalizeTemplateDefinition(value)]),
  )
  if (extra && Object.keys(extra).length) {
    for (const [key, value] of Object.entries(extra)) {
      base[key] = normalizeTemplateDefinition(value)
    }
  }
  return base
}

export async function resolveCreateNewProjectPlan(options?: CreateNewProjectOptions): Promise<CreateNewProjectPlan> {
  const cwd = path.resolve(options?.cwd ?? process.cwd())
  const createConfig = await resolveCommandConfig('create', cwd)

  const renameJson = options?.renameJson ?? createConfig?.renameJson ?? false
  const rawName = options?.name ?? createConfig?.name
  const name = typeof rawName === 'string' ? rawName.trim() : undefined
  const requestedTemplate = options?.type ?? createConfig?.type ?? createConfig?.defaultTemplate ?? defaultTemplate

  const templateDefinitions = getTemplateMap(createConfig?.templateMap)
  const templatesRoot = createConfig?.templatesDir
    ? path.resolve(cwd, createConfig.templatesDir)
    : defaultTemplatesDir

  const requestedTemplateName = String(requestedTemplate)
  const availableTemplates = Object.keys(templateDefinitions).sort()
  if (!templateDefinitions[requestedTemplateName]) {
    throw new Error(formatUnknownTemplateError(requestedTemplateName, availableTemplates))
  }

  const template = requestedTemplateName
  const templateDefinition = templateDefinitions[template]

  if (!templateDefinition) {
    throw new Error(localize(`Template ${template} was not found; check repoctl.config.ts.`, `未找到名为 ${template} 的模板，请检查 repoctl.config.ts`))
  }

  const sourceDir = path.join(templatesRoot, templateDefinition.source)
  const targetInput = name && name.length > 0 ? name : templateDefinition.target
  const targetDir = path.resolve(cwd, targetInput)
  const targetName = path.relative(cwd, targetDir).split(path.sep).join('/')
  await validateCreateTarget(cwd, targetDir)
  const packageJson = await validateCreateSource(sourceDir)
  const hasPackageJson = packageJson !== undefined
  const { plan: workspaceManifest } = await prepareWorkspaceManifest(cwd, targetName)
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
    targetExists: await pathEntryExists(targetDir),
    renameJson,
    hasPackageJson,
    packageJsonFileName,
    packageName,
    templateDefinition,
    workspaceManifest,
  }
}
