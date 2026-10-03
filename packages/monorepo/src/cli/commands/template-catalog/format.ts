import type { TemplateHealthReport } from '../../../commands'
import type { TemplateCatalogEntry } from '../../../core/template-catalog'
import pc from 'picocolors'
import { localize } from '../../../i18n'

export function formatTemplateTable(choices: TemplateCatalogEntry[]) {
  const rows = choices.map(choice => ({
    key: choice.key,
    origin: choice.origin,
    category: choice.category ?? '-',
    source: choice.sourceDir,
    target: choice.target,
    description: choice.description ?? '',
  }))

  const headers = {
    key: 'key',
    origin: localize('origin', '来源'),
    category: localize('category', '分类'),
    source: localize('source', '源目录'),
    target: localize('target', '目标'),
    description: localize('description', '说明'),
  }

  const widths = {
    key: Math.max(headers.key.length, ...rows.map(row => row.key.length)),
    origin: Math.max(headers.origin.length, ...rows.map(row => row.origin.length)),
    category: Math.max(headers.category.length, ...rows.map(row => row.category.length)),
    source: Math.max(headers.source.length, ...rows.map(row => row.source.length)),
    target: Math.max(headers.target.length, ...rows.map(row => row.target.length)),
  }

  const lines = [
    `${headers.key.padEnd(widths.key)}  ${headers.origin.padEnd(widths.origin)}  ${headers.category.padEnd(widths.category)}  ${headers.source.padEnd(widths.source)}  ${headers.target.padEnd(widths.target)}  ${headers.description}`,
    `${'-'.repeat(widths.key)}  ${'-'.repeat(widths.origin)}  ${'-'.repeat(widths.category)}  ${'-'.repeat(widths.source)}  ${'-'.repeat(widths.target)}  ${'-'.repeat(headers.description.length)}`,
    ...rows.map(row => `${row.key.padEnd(widths.key)}  ${row.origin.padEnd(widths.origin)}  ${row.category.padEnd(widths.category)}  ${row.source.padEnd(widths.source)}  ${row.target.padEnd(widths.target)}  ${row.description}`),
  ]

  return lines.join('\n')
}

export function formatTemplateDetail(choice: TemplateCatalogEntry) {
  return [
    `key: ${choice.key}`,
    `origin: ${choice.origin}`,
    `overridesBuiltin: ${choice.overridesBuiltin}`,
    ...(choice.configFile ? [`config: ${choice.configFile}:${choice.configPath ?? 'commands.create.choices'}`] : []),
    localize(`label: ${choice.label}`, `标签：${choice.label}`),
    localize(`category: ${choice.category ?? '-'}`, `分类：${choice.category ?? '-'}`),
    localize(`source: ${choice.sourceDir}`, `源目录：${choice.sourceDir}`),
    localize(`default target: ${choice.target}`, `默认目标：${choice.target}`),
    localize(`description: ${choice.description ?? '-'}`, `说明：${choice.description ?? '-'}`),
  ].join('\n')
}

function escapeMarkdownTableCell(value: string) {
  return value.replaceAll('|', '\\|')
}

export function formatTemplateMarkdownTable(choices: TemplateCatalogEntry[]) {
  return [
    localize('| Key | Origin | Category | Source | Default target | Description |', '| Key | 来源 | 分类 | 源目录 | 默认目标 | 说明 |'),
    '| --- | --- | --- | --- | --- | --- |',
    ...choices.map(choice => [
      `\`${choice.key}\``,
      choice.origin,
      choice.category ?? '-',
      `\`${choice.sourceDir}\``,
      `\`${choice.target}\``,
      choice.description ?? '',
    ].map(value => escapeMarkdownTableCell(value)).join(' | ')).map(row => `| ${row} |`),
  ].join('\n')
}

export function formatTemplateMarkdownDetail(choice: TemplateCatalogEntry) {
  return [
    `# ${choice.key}`,
    '',
    choice.description ?? '',
    '',
    localize('| Field | Value |', '| 字段 | 值 |'),
    '| --- | --- |',
    `| Origin | ${choice.origin} |`,
    `| Overrides built-in | ${choice.overridesBuiltin} |`,
    ...(choice.configFile ? [`| Config | ${escapeMarkdownTableCell(choice.configFile)}:${escapeMarkdownTableCell(choice.configPath ?? 'commands.create.choices')} |`] : []),
    localize(`| Label | ${escapeMarkdownTableCell(choice.label)} |`, `| 标签 | ${escapeMarkdownTableCell(choice.label)} |`),
    localize(`| Category | ${escapeMarkdownTableCell(choice.category ?? '-')} |`, `| 分类 | ${escapeMarkdownTableCell(choice.category ?? '-')} |`),
    localize(`| Source | \`${escapeMarkdownTableCell(choice.sourceDir)}\` |`, `| 源目录 | \`${escapeMarkdownTableCell(choice.sourceDir)}\` |`),
    localize(`| Default target | \`${escapeMarkdownTableCell(choice.target)}\` |`, `| 默认目标 | \`${escapeMarkdownTableCell(choice.target)}\` |`),
  ].join('\n')
}

export function formatTemplateHealthStatus(status: 'pass' | 'warn' | 'fail') {
  if (status === 'pass') {
    return pc.green('PASS')
  }
  if (status === 'warn') {
    return pc.yellow('WARN')
  }
  return pc.red('FAIL')
}

export function formatTemplateHealthReport(report: TemplateHealthReport, color = false) {
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
