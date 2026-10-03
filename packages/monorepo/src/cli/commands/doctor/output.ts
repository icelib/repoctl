import type { DoctorReport, DoctorStatus } from '../../../commands/doctor'
import os from 'node:os'
import pc from 'picocolors'
import { localize } from '../../../i18n'

interface DoctorOutputOptions {
  json?: boolean
  markdown?: boolean
  redact?: boolean
  strict?: boolean
}

function formatDoctorStatus(status: DoctorStatus) {
  if (status === 'pass') {
    return pc.green('PASS')
  }
  if (status === 'warn') {
    return pc.yellow('WARN')
  }
  return pc.red('FAIL')
}

function formatDoctorReport(report: DoctorReport, color = false) {
  const status = color
    ? formatDoctorStatus
    : (value: DoctorStatus) => value.toUpperCase()

  const lines = [
    localize(`workspace: ${report.workspaceDir}`, `工作区：${report.workspaceDir}`),
    localize(`packages: ${report.packageCount}`, `包数量：${report.packageCount}`),
    '',
  ]

  for (const check of report.checks) {
    lines.push(`[${status(check.status)}] ${check.title}`)
    lines.push(`  ${check.detail}`)
    if (check.suppression) {
      lines.push(`  suppression: ${check.suppression.state}; reason: ${check.suppression.reason}; expires: ${check.suppression.expires ?? 'never'}`)
    }
    if (check.fix) {
      lines.push(localize(`  fix: ${check.fix}`, `  修复：${check.fix}`))
    }
  }

  for (const item of report.suppressions ?? []) {
    lines.push(`suppression ${item.id}: ${item.state}; matched: ${item.matched}; reason: ${item.reason}; expires: ${item.expires ?? 'never'}`)
  }
  lines.push('')
  lines.push(
    color
      ? localize(`summary: ${pc.green(String(report.summary.pass))} pass, ${pc.yellow(String(report.summary.warn))} warn, ${pc.red(String(report.summary.fail))} fail`, `摘要：${pc.green(String(report.summary.pass))} 通过，${pc.yellow(String(report.summary.warn))} 警告，${pc.red(String(report.summary.fail))} 失败`)
      : localize(`summary: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`, `摘要：${report.summary.pass} 通过，${report.summary.warn} 警告，${report.summary.fail} 失败`),
  )

  return lines.join('\n')
}

function formatMarkdownTable(rows: Array<[string, string | number | undefined]>) {
  const formatCell = (value: string | number | undefined) => String(value ?? '-')
    .split('|')
    .join('\\|')
    .split('\n')
    .join('<br>')

  return [
    localize('| Field | Value |', '| 字段 | 值 |'),
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${label} | ${formatCell(value)} |`),
  ].join('\n')
}

function formatDoctorMarkdown(report: DoctorReport) {
  const warningsAndFailures = report.checks.filter(check => check.status !== 'pass')

  return [
    localize('# Repo doctor report', '# Repo doctor 诊断报告'),
    '',
    formatMarkdownTable([
      ['workspace', report.workspaceDir],
      ['packages', report.packageCount],
      ['pass', report.summary.pass],
      ['warn', report.summary.warn],
      ['fail', report.summary.fail],
    ]),
    '',
    ...(warningsAndFailures.length > 0
      ? [
          localize('## Findings', '## 问题'),
          '',
          ...warningsAndFailures.map(check => localize(`- ${check.status}: ${check.title}${check.fix ? ` (fix: ${check.fix})` : ''} — ${check.detail}`, `- ${check.status}: ${check.title}${check.fix ? `（修复：${check.fix}）` : ''} — ${check.detail}`)),
          '',
        ]
      : []),
    ...(report.suppressions?.length ? [localize('## Suppressions', '## 抑制记录'), '', ...report.suppressions.map(item => `- ${item.id}: ${item.state}; matched: ${item.matched}; reason: ${item.reason}; expires: ${item.expires ?? 'never'}`), ''] : []),
    localize('## Checks', '## 检查项'),
    '',
    ...report.checks.map(check => `- ${check.status}: ${check.title}`),
  ].join('\n')
}

function replaceAll(value: string, search: string, replacement: string) {
  return search.length > 0 ? value.split(search).join(replacement) : value
}

function redactDoctorReportValue(value: unknown, replacements: Array<[string, string]>): unknown {
  if (typeof value === 'string') {
    return replacements.reduce((result, [search, replacement]) => replaceAll(result, search, replacement), value)
  }
  if (Array.isArray(value)) {
    return value.map(item => redactDoctorReportValue(item, replacements))
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactDoctorReportValue(item, replacements)]),
    )
  }
  return value
}

function redactDoctorReport(report: DoctorReport): DoctorReport {
  const candidates: Array<[string, string]> = [
    [report.workspaceDir, '<workspace>'],
    [report.cwd, '<cwd>'],
    [os.homedir(), '<home>'],
  ]
  const replacements = candidates
    .filter(([search], index, entries) => search.length > 0 && entries.findIndex(([value]) => value === search) === index)
    .sort(([left], [right]) => right.length - left.length)

  return redactDoctorReportValue(report, replacements) as DoctorReport
}

export function createDoctorReportOutput(report: DoctorReport, opts: DoctorOutputOptions) {
  const outputReport = opts.redact ? redactDoctorReport(report) : report
  if (opts.json) {
    return JSON.stringify(outputReport, null, 2)
  }
  if (opts.markdown) {
    return formatDoctorMarkdown(outputReport)
  }
  return formatDoctorReport(outputReport)
}

export function createInteractiveDoctorReportOutput(report: DoctorReport, opts: DoctorOutputOptions) {
  const outputReport = opts.redact ? redactDoctorReport(report) : report
  return formatDoctorReport(outputReport, true)
}

export function hasDoctorBlockingIssues(report: DoctorReport, opts: DoctorOutputOptions) {
  return report.summary.fail > 0 || (opts.strict === true && report.summary.warn > 0)
}
