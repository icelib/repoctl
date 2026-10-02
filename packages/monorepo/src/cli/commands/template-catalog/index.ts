import type { Command, TemplateCategory } from '@icebreakers/monorepo-templates'
import process from 'node:process'
import path from 'pathe'
import { logger } from '../../../core/logger'
import { resolveTemplateCatalog } from '../../../core/template-catalog'
import { localize } from '../../../i18n'
import fs from '../../../utils/fs'
import { registerTemplateInstanceCommands } from '../template-instances'
import { formatTemplateDetail, formatTemplateHealthReport, formatTemplateMarkdownDetail, formatTemplateMarkdownTable, formatTemplateTable } from './format'
import { registerTemplateValidation } from './validate'

interface TemplatesCliOptions {
  json?: boolean
  markdown?: boolean
  category?: string
  check?: boolean
  out?: string
}

async function emitTemplateOutput(content: string, options: TemplatesCliOptions) {
  if (!options.out) {
    if (options.json) {
      process.stdout.write(`${content}\n`)
    }
    else {
      logger.log(content)
    }
    return
  }

  const outFile = path.resolve(process.cwd(), options.out)
  await fs.outputFile(outFile, `${content}\n`, 'utf8')
  logger.success(localize(`Wrote ${path.relative(process.cwd(), outFile)}`, `已写入 ${path.relative(process.cwd(), outFile)}`))
}

export function registerTemplatesCommands(program: Command) {
  const templates = program.command('templates')
    .alias('tpl')
    .description(localize('List built-in and configured templates', '列出内置与自定义模板'))
    .argument('[key]', localize('Show details for a template key', '查看指定模板详情'))
    .option('-c, --category <category>', localize('Filter by library, app, service, docs, or tool', '按模板分类过滤：library / app / service / docs / tool'))
    .option('--check', localize('Check template configuration, metadata and directories', '检查模板配置、元数据、目录和临时文件'))
    .option('--json', localize('Output JSON for scripts', '输出 JSON，方便脚本消费'))
    .option('--markdown', localize('Output Markdown for documentation', '输出 Markdown，方便同步文档'))
    .option('--out <file>', localize('Write output to a file', '把当前输出写入文件'))
    .action(async (key: string | undefined, opts: TemplatesCliOptions) => {
      const {
        isTemplateCategory,
        suggestTemplateKey,
        templateCategories,
      } = await import('@icebreakers/monorepo-templates')

      if (opts.check) {
        const { checkTemplates } = await import('@/commands')
        const report = await checkTemplates()
        if (opts.json) {
          await emitTemplateOutput(JSON.stringify(report, null, 2), opts)
        }
        else {
          await emitTemplateOutput(formatTemplateHealthReport(report, !opts.out), opts)
        }
        if (report.summary.fail > 0) {
          process.exitCode = 1
        }
        return
      }

      const catalog = await resolveTemplateCatalog()
      for (const diagnostic of catalog.diagnostics) {
        process.stderr.write(`[${diagnostic.status.toUpperCase()}] ${diagnostic.configFile ?? 'repoctl.config'}:${diagnostic.configPath}: ${diagnostic.detail}\n`)
      }
      if (catalog.diagnostics.some(diagnostic => diagnostic.status === 'fail')) {
        process.exitCode = 1
      }
      if (key) {
        const choice = catalog.entries.find(entry => entry.key === key)
        if (!choice) {
          logger.error(localize(`Unknown template: ${key}`, `未知模板：${key}`))
          const suggestion = suggestTemplateKey(key, { keys: catalog.entries.map(entry => entry.key) })
          if (suggestion) {
            logger.info(localize(`Did you mean \`${suggestion}\`?`, `你是否想使用 \`${suggestion}\`？`))
          }
          logger.info(localize('Run `repo templates` to list available templates.', '运行 `repo templates` 查看可用模板。'))
          process.exitCode = 1
          return
        }
        if (opts.json) {
          await emitTemplateOutput(JSON.stringify(choice, null, 2), opts)
          return
        }
        if (opts.markdown) {
          await emitTemplateOutput(formatTemplateMarkdownDetail(choice), opts)
          return
        }
        await emitTemplateOutput(localize(`Template detail:\n${formatTemplateDetail(choice)}`, `模板详情：\n${formatTemplateDetail(choice)}`), opts)
        if (!opts.out) {
          logger.info(localize(`Next: run \`repo new <name> --template ${choice.key}\`.`, `下一步：运行 \`repo new <name> --template ${choice.key}\`。`))
        }
        return
      }

      let category: TemplateCategory | undefined
      if (opts.category) {
        if (!isTemplateCategory(opts.category)) {
          logger.error(localize(`Unknown template category: ${opts.category}`, `未知模板分类：${opts.category}`))
          logger.info(localize(`Available categories: ${templateCategories.join(', ')}`, `可用分类：${templateCategories.join(', ')}`))
          process.exitCode = 1
          return
        }
        category = opts.category
      }

      const choices = category ? catalog.entries.filter(entry => entry.category === category) : catalog.entries
      if (opts.json) {
        await emitTemplateOutput(JSON.stringify(choices, null, 2), opts)
        return
      }
      if (opts.markdown) {
        await emitTemplateOutput(formatTemplateMarkdownTable(choices), opts)
        return
      }

      await emitTemplateOutput(localize(`Available templates:\n${formatTemplateTable(choices)}`, `可用模板：\n${formatTemplateTable(choices)}`), opts)
      if (!opts.out) {
        logger.info(localize('Next: run `repo new <name> --template <key>`.', '下一步：运行 `repo new <name> --template <key>`。'))
      }
    })
  registerTemplateInstanceCommands(templates)
  registerTemplateValidation(templates)
}
