import type { PublicApiReport } from './types'

const cell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ').replaceAll('\r', '')

export function formatPublicApiReport(report: PublicApiReport) {
  const lines = ['# Public API report', '', `Status: ${report.status}`, '', report.review, '', '| Package / entry | Baseline | Status | Change intents |', '| --- | --- | --- | --- |']
  for (const entry of report.entries) {
    lines.push(`| ${cell(`${entry.packageName ?? entry.workspace}:${entry.subpath}`)} | ${cell(entry.baseline)} | ${entry.status} | ${entry.changeIntents.map(cell).join(', ') || 'none'} |`)
  }
  for (const entry of report.entries) {
    if (entry.diff) {
      lines.push('', `## ${cell(entry.workspace)} ${cell(entry.subpath)}`, '', ...entry.diff.split('\n').map(line => `    ${line}`))
    }
    for (const diagnostic of entry.diagnostics) {
      lines.push('', `- ${cell(entry.baseline)}: ${diagnostic.severity} ${cell(diagnostic.code)}: ${cell(diagnostic.message)}`)
    }
  }
  for (const diagnostic of report.diagnostics) {
    lines.push('', `- ${diagnostic.severity} ${cell(diagnostic.code)}: ${cell(diagnostic.message)}`)
  }
  for (const entry of report.skipped) {
    lines.push('', `- ${cell(entry.workspace)}: skipped (${entry.reason})`)
  }
  return lines.join('\n')
}
