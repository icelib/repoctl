import type { TemplateDefinition, TemplateParameterPrompt, TemplateParameterValues } from '@icebreakers/monorepo-templates'
import type { TemplateCatalogEntry } from '../../core/template-catalog'
import type { templateMap } from '../../core/template-catalog/definitions'
import type { ResolvedTemplateSource } from '../../core/template-source'
import type { CreateParameterReport } from './parameters/prepare'
import process from 'node:process'
import { suggestTemplateKey } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import fs from '@/utils/fs'
import { resolveCommandValues } from '../../core/config/resolution'
import { createTemplateCatalog } from '../../core/template-catalog'
import { loadTemplateCatalogContext } from '../../core/template-catalog/config'
import { resolveRemoteTemplateSource } from '../../core/template-source'
import { attachCreateParameters } from './parameters/prepare'

export { getCreateChoices, getTemplateMap, templateMap } from '../../core/template-catalog/definitions'

export type CreateNewProjectType = keyof typeof templateMap

export interface CreateNewProjectOptions {
  /** Strict values for repoctl.template.json; sensitive values stay in memory only. */
  parameters?: TemplateParameterValues
  /** Optional prompt adapter; programmatic callers are noninteractive by default. */
  parameterPrompt?: TemplateParameterPrompt
  /** For remote sources, use only an exact verified cache entry. */
  offline?: boolean
  /** Asset cache directory; relative paths use cwd. */
  cacheDir?: string
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
  parameterization?: CreateParameterReport
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
  sourceResolution?: ResolvedTemplateSource
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

async function resolvePlan(options: CreateNewProjectOptions | undefined, download: boolean): Promise<CreateNewProjectPlan> {
  const cwd = options?.cwd ?? process.cwd()
  const context = await loadTemplateCatalogContext({ cwd })
  const createConfig = context.createConfig
  const catalog = createTemplateCatalog(context)

  const effective = resolveCommandValues('create', createConfig, { renameJson: options?.renameJson, name: options?.name, type: options?.type, offline: options?.offline, cacheDir: options?.cacheDir }).values
  const renameJson = effective.renameJson!
  const rawName = effective.name
  const name = typeof rawName === 'string' ? rawName.trim() : undefined
  const requestedTemplate = effective.type ?? effective.defaultTemplate ?? defaultTemplate

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
  const templateDefinition = { source: templateInfo.source, target: templateInfo.target, ...(templateInfo.remote ? { remote: templateInfo.remote } : {}) }
  const cacheDir = effective.cacheDir
  const sourceResolution = templateInfo.remote
    ? await resolveRemoteTemplateSource(templateInfo.remote, templateInfo.source, {
        cwd,
        offline: !download || (effective.offline ?? false),
        ...(cacheDir ? { cacheDir } : {}),
      })
    : undefined
  const sourceDir = sourceResolution?.sourceDir ?? templateInfo.sourceDir
  const targetName = name && name.length > 0 ? name : templateDefinition.target
  const targetDir = path.join(cwd, targetName)
  const sourceJsonPath = path.resolve(sourceDir, 'package.json')
  const hasPackageJson = await fs.pathExists(sourceJsonPath)
  const packageJsonFileName = renameJson ? 'package.mock.json' : 'package.json'
  const packageName = name?.startsWith('@') ? name : path.basename(targetName)

  return attachCreateParameters({
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
    ...(sourceResolution ? { sourceResolution } : {}),
  }, options?.parameters, options?.parameterPrompt)
}

/** Read-only creation preview; fetch remote assets explicitly before planning. */
export function resolveCreateNewProjectPlan(options?: CreateNewProjectOptions) {
  return resolvePlan(options, false)
}

/** Internal creation path may acquire verified remote assets before any target writes. */
export function resolveCreationPlan(options?: CreateNewProjectOptions) {
  return resolvePlan(options, true)
}
