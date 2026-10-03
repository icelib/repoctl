import type { TemplateCatalogEntry } from '../core/template-catalog'
import { readdir, stat } from 'node:fs/promises'
import { shouldSkipTemplatePath } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { resolveTemplateCatalog } from '../core/template-catalog'
import { localize } from '../i18n'

export type TemplateHealthStatus = 'pass' | 'warn' | 'fail'

export interface TemplateHealthCheck {
  id: string
  status: TemplateHealthStatus
  title: string
  detail: string
  template?: string
  configFile?: string | null
  configPath?: string
  fix?: string
}

export interface TemplateHealthSummary {
  pass: number
  warn: number
  fail: number
}

export interface TemplateHealthReport {
  templatesDir: string
  templateCount: number
  templates: TemplateCatalogEntry[]
  configFile: string | null
  checks: TemplateHealthCheck[]
  summary: TemplateHealthSummary
}

export interface CheckTemplatesOptions {
  cwd?: string
  templatesDir?: string
}

async function collectFiles(rootDir: string) {
  const files: string[] = []

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
        return
      }
      if (entry.isFile()) {
        files.push(entryPath)
      }
    }))
  }

  await walk(rootDir)
  return files
}

function summarizeTemplateChecks(checks: TemplateHealthCheck[]): TemplateHealthSummary {
  return checks.reduce<TemplateHealthSummary>((summary, check) => {
    summary[check.status] += 1
    return summary
  }, {
    pass: 0,
    warn: 0,
    fail: 0,
  })
}

function checkDuplicates(choices: TemplateCatalogEntry[], field: 'sourceDir' | 'target') {
  const seen = new Map<string, string>()
  const duplicates: Array<[string, string, string]> = []

  for (const choice of choices) {
    const value = field === 'target' ? path.normalize(choice.target) : choice.sourceDir
    const previous = seen.get(value)
    if (previous) {
      duplicates.push([value, previous, choice.key])
      continue
    }
    seen.set(value, choice.key)
  }

  return duplicates
}

export async function checkTemplates(options: CheckTemplatesOptions = {}): Promise<TemplateHealthReport> {
  const catalog = await resolveTemplateCatalog(options)
  const { templatesDir, entries: choices } = catalog
  const checks: TemplateHealthCheck[] = catalog.diagnostics.map(diagnostic => ({
    ...diagnostic,
    title: localize('Template configuration', '模板配置'),
    detail: `${diagnostic.configFile ?? 'repoctl.config'}:${diagnostic.configPath}: ${diagnostic.detail}`,
  }))

  const sourceDuplicates = checkDuplicates(choices, 'sourceDir')
  checks.push(sourceDuplicates.length
    ? {
        id: 'unique-source',
        status: 'fail',
        title: localize('Template source uniqueness', '模板 source 唯一性'),
        detail: localize(`Duplicate sources: ${sourceDuplicates.map(([value, first, second]) => `${value} (${first}, ${second})`).join(', ')}`, `存在重复 source：${sourceDuplicates.map(([value, first, second]) => `${value} (${first}, ${second})`).join(', ')}`),
        fix: localize('Update repoctl.config / template-data.mjs so every template has a unique source.', '调整 repoctl.config / template-data.mjs，确保每个模板 key 指向独立 source。'),
      }
    : {
        id: 'unique-source',
        status: 'pass',
        title: localize('Template source uniqueness', '模板 source 唯一性'),
        detail: localize('Every template source is unique.', '所有模板 source 都是唯一的。'),
      })

  const targetDuplicates = checkDuplicates(choices, 'target')
  checks.push(targetDuplicates.length
    ? {
        id: 'unique-target',
        status: 'fail',
        title: localize('Template target uniqueness', '模板 target 唯一性'),
        detail: localize(`Duplicate targets: ${targetDuplicates.map(([value, first, second]) => `${value} (${first}, ${second})`).join(', ')}`, `存在重复 target：${targetDuplicates.map(([value, first, second]) => `${value} (${first}, ${second})`).join(', ')}`),
        fix: localize('Update repoctl.config / template-data.mjs so every template has a unique target.', '调整 repoctl.config / template-data.mjs，避免多个模板默认写入同一目标目录。'),
      }
    : {
        id: 'unique-target',
        status: 'pass',
        title: localize('Template target uniqueness', '模板 target 唯一性'),
        detail: localize('Every template target is unique.', '所有模板 target 都是唯一的。'),
      })

  for (const choice of choices) {
    const sourceDir = choice.sourceDir
    const packageJsonPath = path.join(sourceDir, 'package.json')
    const sourceExists = await stat(sourceDir).then(info => info.isDirectory()).catch(() => false)

    checks.push(sourceExists
      ? {
          id: 'source-dir',
          template: choice.key,
          status: 'pass',
          title: localize('Template directory', '模板目录'),
          detail: localize(`${choice.key} source exists: ${path.relative(templatesDir, sourceDir)}`, `${choice.key} 源目录存在：${path.relative(templatesDir, sourceDir)}`),
        }
      : {
          id: 'source-dir',
          template: choice.key,
          status: 'fail',
          title: localize('Template directory', '模板目录'),
          detail: localize(`${choice.key} source directory is missing or invalid: ${sourceDir}`, `${choice.key} source 目录不存在或无效：${sourceDir}`),
          fix: localize('Add the directory or correct repoctl.config / template-data.mjs.', '补齐模板目录，或修正 repoctl.config / template-data.mjs 中的 source。'),
        })

    const packageExists = sourceExists && await stat(packageJsonPath).then(info => info.isFile()).catch(() => false)
    checks.push(packageExists
      ? {
          id: 'package-json',
          template: choice.key,
          status: 'pass',
          title: localize('Template package.json', '模板 package.json'),
          detail: localize(`${choice.key} contains package.json.`, `${choice.key} 包含 package.json。`),
        }
      : {
          id: 'package-json',
          template: choice.key,
          status: 'fail',
          title: localize('Template package.json', '模板 package.json'),
          detail: localize(`${choice.key} is missing package.json.`, `${choice.key} 缺少 package.json。`),
          fix: localize('Template roots need package.json so scaffolding can rewrite metadata.', '模板根目录应包含 package.json，脚手架会基于它重写 name/version/repository。'),
        })

    checks.push(choice.category && choice.description
      ? {
          id: 'metadata',
          template: choice.key,
          status: 'pass',
          title: localize('Template metadata', '模板元数据'),
          detail: localize(`${choice.key} declares category and description.`, `${choice.key} 已声明 category 和 description。`),
        }
      : {
          id: 'metadata',
          template: choice.key,
          status: 'warn',
          title: localize('Template metadata', '模板元数据'),
          detail: localize(`${choice.key} is missing category or description.`, `${choice.key} 缺少 category 或 description。`),
          fix: localize('Add category and description in repoctl.config / template-data.mjs.', '补充 repoctl.config / template-data.mjs 中的 category 和 description，方便 CLI 和文档展示。'),
        })

    if (!sourceExists) {
      continue
    }

    const skippedFiles = (await collectFiles(sourceDir))
      .filter(file => shouldSkipTemplatePath(sourceDir, file))
      .map(file => path.relative(sourceDir, file))

    checks.push(skippedFiles.length
      ? {
          id: 'filtered-files',
          template: choice.key,
          status: 'fail',
          title: localize('Temporary template files', '模板临时文件'),
          detail: localize(`${choice.key} contains filtered files: ${skippedFiles.join(', ')}`, `${choice.key} 包含会被脚手架过滤的文件：${skippedFiles.join(', ')}`),
          fix: localize('Remove temporary, cache, or generated files from the template source.', '删除模板源目录里的临时、缓存或生成文件。'),
        }
      : {
          id: 'filtered-files',
          template: choice.key,
          status: 'pass',
          title: localize('Temporary template files', '模板临时文件'),
          detail: localize(`${choice.key} contains no filtered temporary files.`, `${choice.key} 没有检测到会被过滤的临时文件。`),
        })
  }

  for (const check of checks) {
    const entry = choices.find(choice => choice.key === check.template)
    if (entry?.configPath && !check.configPath) {
      check.configFile = entry.configFile
      check.configPath = entry.configPath
    }
  }
  return {
    templatesDir,
    templateCount: choices.length,
    templates: choices,
    configFile: catalog.configFile,
    checks,
    summary: summarizeTemplateChecks(checks),
  }
}
