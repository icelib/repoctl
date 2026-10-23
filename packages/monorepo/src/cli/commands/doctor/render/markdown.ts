import type { DoctorReport } from '../../../../commands/doctor'
import type { DoctorCheckGroup } from './groups'
import { localize } from '../../../../i18n'
import { groupDoctorChecks } from './groups'

/** Render data as text, including paths that contain Markdown syntax or Windows separators. */
function escape(value: string | number | undefined) {
  return String(value ?? '-')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/[\\`*_{}[\]()#+.!|~\-]/g, '\\$&')
    .replace(/\r\n|\r|\n/g, '<br>')
}

function table(rows: Array<[string, string | number | undefined]>) {
  return [
    localize('| Field | Value |', '| 字段 | 值 |'),
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${escape(label)} | ${escape(value)} |`),
  ].join('\n')
}

function finding({ check, paths, count }: DoctorCheckGroup) {
  const occurrences = count > 1 ? localize(` (${count} checks)`, `（${count} 项检查）`) : ''
  return [
    `- **${check.status.toUpperCase()}** [${escape(check.id)}]: ${escape(check.title)}${occurrences}`,
    ...paths.map(filename => localize(`  - Path: ${escape(filename)}`, `  - 路径：${escape(filename)}`)),
    ...(check.field === undefined ? [] : [localize(`  - Field: ${escape(check.field)}`, `  - 字段：${escape(check.field)}`)]),
    `  - ${escape(check.detail)}`,
    ...(check.suppression ? [`  - suppression: ${escape(check.suppression.state)}; reason: ${escape(check.suppression.reason)}; expires: ${escape(check.suppression.expires ?? 'never')}`] : []),
    ...(check.fix ? [localize(`  - Fix: ${escape(check.fix)}`, `  - 修复：${escape(check.fix)}`)] : []),
  ].join('\n')
}

export function formatDoctorMarkdown(report: DoctorReport) {
  const groups = groupDoctorChecks(report.checks)
  const findings = groups.filter(group => group.check.status !== 'pass')
  const passing = groups.filter(group => group.check.status === 'pass')
  return [
    localize('# Repo doctor report', '# Repo doctor 诊断报告'),
    '',
    table([
      ['workspace', report.workspaceDir],
      ['packages', report.packageCount],
      ['pass', report.summary.pass],
      ['warn', report.summary.warn],
      ['fail', report.summary.fail],
    ]),
    '',
    ...(findings.length ? [localize('## Findings', '## 问题'), '', ...findings.map(finding), ''] : []),
    ...(report.suppressions?.length
      ? [localize('## Suppressions', '## 抑制记录'), '', ...report.suppressions.map(item => `- ${escape(item.id)}: ${escape(item.state)}; matched: ${item.matched}; reason: ${escape(item.reason)}; expires: ${escape(item.expires ?? 'never')}`), '']
      : []),
    ...(passing.length ? [localize('## Passing checks', '## 通过的检查'), '', ...passing.map(finding)] : []),
  ].join('\n')
}
