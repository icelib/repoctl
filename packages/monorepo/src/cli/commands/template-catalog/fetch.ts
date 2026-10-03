import type { Command } from '@icebreakers/monorepo-templates'
import process from 'node:process'
import { createTemplateCatalog } from '../../../core/template-catalog'
import { loadTemplateCatalogContext } from '../../../core/template-catalog/config'
import { resolveRemoteTemplateSource } from '../../../core/template-source'
import { localize } from '../../../i18n'

interface Options {
  offline?: boolean
  cacheDir?: string
  json?: boolean
}

export function registerTemplateFetch(templates: Command) {
  templates.command('fetch')
    .description(localize('Fetch and verify fixed remote template assets', '获取并验证固定的远程模板资产'))
    .argument('<key>')
    .option('--offline', localize('Read only an exact verified cache entry', '只读取精确匹配且通过校验的缓存'))
    .option('--cache-dir <directory>', localize('Template asset cache directory', '模板资产缓存目录'))
    .option('--json', localize('Print resolved source identity as JSON', '以 JSON 输出固定来源身份'))
    .action(async (key: string, _local: Options, command: Command) => {
      const options = command.optsWithGlobals() as Options
      try {
        const cwd = process.cwd()
        const context = await loadTemplateCatalogContext({ cwd })
        const catalog = createTemplateCatalog(context)
        const invalid = catalog.diagnostics.find(item => item.status === 'fail' && (!item.template || item.template === key))
        const entry = catalog.entries.find(item => item.key === key)
        if (invalid || !entry?.remote) {
          throw new Error(invalid?.detail ?? `Template ${key} does not declare an npm or Git remote source.`)
        }
        const cacheDir = options.cacheDir ?? context.createConfig.cacheDir
        const result = await resolveRemoteTemplateSource(entry.remote, entry.source, { cwd, offline: options.offline ?? context.createConfig.offline ?? false, ...(cacheDir ? { cacheDir } : {}) })
        process.stdout.write(`${options.json ? JSON.stringify(result, null, 2) : `${key}: ${result.cache}\n${JSON.stringify(result.resolved)}\n${result.sourceDir}`}\n`)
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        process.stdout.write(`${options.json ? JSON.stringify({ error: message }, null, 2) : message}\n`)
        process.exitCode = 1
      }
    })
}
