import type { Command, TemplateCategory, TemplateChoice } from '@icebreakers/monorepo-templates'
import type { TemplateHealthReport } from '../../commands'
import process from 'node:process'
import path from 'pathe'
import pc from 'picocolors'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import fs from '../../utils/fs'
import { registerTemplateInstanceCommands } from './template-instances'

interface TemplatesCliOptions {
  json?: boolean
  markdown?: boolean
  category?: string
  check?: boolean
  out?: string
}

function formatTemplateTable(choices: TemplateChoice[]) {
  const rows = choices.map(choice => ({
    key: choice.key,
    category: choice.category ?? '-',
    target: choice.target,
    description: choice.description ?? '',
  }))

  const headers = {
    key: 'key',
    category: localize('category', '分类'),
    target: localize('target', '目标'),
    description: localize('description', '说明'),
  }

  const widths = {
    key: Math.max(headers.key.length, ...rows.map(row => row.key.length)),
    category: Math.max(headers.category.length, ...rows.map(row => row.category.length)),
    target: Math.max(headers.target.length, ...rows.map(row => row.target.length)),
  }

  const lines = [
    `${headers.key.padEnd(widths.key)}  ${headers.category.padEnd(widths.category)}  ${headers.target.padEnd(widths.target)}  ${headers.description}`,
    `${'-'.repeat(widths.key)}  ${'-'.repeat(widths.category)}  ${'-'.repeat(widths.target)}  ${'-'.repeat(headers.description.length)}`,
    ...rows.map(row => `${row.key.padEnd(widths.key)}  ${row.category.padEnd(widths.category)}  ${row.target.padEnd(widths.target)}  ${row.description}`),
  ]

  return lines.join('\n')
}

function formatTemplateDetail(choice: TemplateChoice) {
  return [
    `key: ${choice.key}`,
    localize(`label: ${choice.label}`, `标签：${choice.label}`),
    localize(`category: ${choice.category ?? '-'}`, `分类：${choice.category ?? '-'}`),
    localize(`source: templates/${choice.source}`, `源目录：templates/${choice.source}`),
    localize(`default target: ${choice.target}`, `默认目标：${choice.target}`),
    localize(`description: ${choice.description ?? '-'}`, `说明：${choice.description ?? '-'}`),
  ].join('\n')
}

function escapeMarkdownTableCell(value: string) {
  return value.replaceAll('|', '\\|')
}

function formatTemplateMarkdownTable(choices: TemplateChoice[]) {
  return [
    localize('| Key | Category | Source | Default target | Description |', '| Key | 分类 | 源目录 | 默认目标 | 说明 |'),
    '| --- | --- | --- | --- | --- |',
    ...choices.map(choice => [
      `\`${choice.key}\``,
      choice.category ?? '-',
      `\`templates/${choice.source}\``,
      `\`${choice.target}\``,
      choice.description ?? '',
    ].map(value => escapeMarkdownTableCell(value)).join(' | ')).map(row => `| ${row} |`),
  ].join('\n')
}

function formatTemplateMarkdownDetail(choice: TemplateChoice) {
  return [
    `# ${choice.key}`,
    '',
    choice.description ?? '',
    '',
    localize('| Field | Value |', '| 字段 | 值 |'),
    '| --- | --- |',
    localize(`| Label | ${escapeMarkdownTableCell(choice.label)} |`, `| 标签 | ${escapeMarkdownTableCell(choice.label)} |`),
    localize(`| Category | ${escapeMarkdownTableCell(choice.category ?? '-')} |`, `| 分类 | ${escapeMarkdownTableCell(choice.category ?? '-')} |`),
    localize(`| Source | \`templates/${escapeMarkdownTableCell(choice.source)}\` |`, `| 源目录 | \`templates/${escapeMarkdownTableCell(choice.source)}\` |`),
    localize(`| Default target | \`${escapeMarkdownTableCell(choice.target)}\` |`, `| 默认目标 | \`${escapeMarkdownTableCell(choice.target)}\` |`),
  ].join('\n')
}

function formatTemplateHealthStatus(status: 'pass' | 'warn' | 'fail') {
  if (status === 'pass') {
    return pc.green('PASS')
  }
  if (status === 'warn') {
    return pc.yellow('WARN')
  }
  return pc.red('FAIL')
}

function formatTemplateHealthReport(report: TemplateHealthReport, color = false) {
  const status = color
    ? formatTemplateHealthStatus
    : (value: 'pass' | 'warn' | 'fail') => value.toUpperCase()

  const lines = [
    localize(`templates: ${report.templatesDir}`, `模板目录：${report.templatesDir}`),
    localize(`count: ${report.templateCount}`, `数量：${report.templateCount}`),
    '',
  ]

  for (const check of report.checks) {
    const prefix = check.template ? `${check.template}: ` : ''
    lines.push(`[${status(check.status)}] ${prefix}${check.title}`)
    lines.push(`  ${check.detail}`)
    if (check.fix) {
      lines.push(localize(`  fix: ${check.fix}`, `  修复：${check.fix}`))
    }
  }

  lines.push('')
  lines.push(
    color
      ? localize(`summary: ${pc.green(String(report.summary.pass))} pass, ${pc.yellow(String(report.summary.warn))} warn, ${pc.red(String(report.summary.fail))} fail`, `摘要：${pc.green(String(report.summary.pass))} 通过，${pc.yellow(String(report.summary.warn))} 警告，${pc.red(String(report.summary.fail))} 失败`)
      : localize(`summary: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`, `摘要：${report.summary.pass} 通过，${report.summary.warn} 警告，${report.summary.fail} 失败`),
  )

  return lines.join('\n')
}

async function emitTemplateOutput(content: string, options: TemplatesCliOptions) {
  if (!options.out) {
    logger.log(content)
    return
  }

  const outFile = path.resolve(process.cwd(), options.out)
  await fs.outputFile(outFile, `${content}\n`, 'utf8')
  logger.success(localize(`Wrote ${path.relative(process.cwd(), outFile)}`, `已写入 ${path.relative(process.cwd(), outFile)}`))
}

export function registerTemplatesCommands(program: Command) {
  const templates = program.command('templates')
    .alias('tpl')
    .description(localize('List the built-in templates', '列出可用的内置模板'))
    .argument('[key]', localize('Show details for a template key', '查看指定模板详情'))
    .option('-c, --category <category>', localize('Filter by library, app, service, docs, or tool', '按模板分类过滤：library / app / service / docs / tool'))
    .option('--check', localize('Check built-in template metadata and directories', '检查内置模板元数据、目录和临时文件'))
    .option('--json', localize('Output JSON for scripts', '输出 JSON，方便脚本消费'))
    .option('--markdown', localize('Output Markdown for documentation', '输出 Markdown，方便同步文档'))
    .option('--out <file>', localize('Write output to a file', '把当前输出写入文件'))
    .action(async (key: string | undefined, opts: TemplatesCliOptions) => {
      const {
        getTemplateChoice,
        getTemplateChoices,
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

      if (key) {
        const choice = getTemplateChoice(key)
        if (!choice) {
          logger.error(localize(`Unknown template: ${key}`, `未知模板：${key}`))
          const suggestion = suggestTemplateKey(key)
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

      const choices = getTemplateChoices(category ? { category } : {})
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
}
