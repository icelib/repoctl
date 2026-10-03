import type { EnvCacheReport } from '../../types/env-cache'

const cell = (value: string | null) => (value ?? '—').replace(/[\r\n|]/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`/g, '&#96;')

export function formatEnvironmentCache(report: EnvCacheReport, markdown = false) {
  const lines = [`${markdown ? '# ' : ''}Environment cache check: ${report.status}`, '', `${report.summary.fail} failures, ${report.summary.warn} warnings, ${report.summary.info} notes, ${report.summary.suppressed} suppressed.`]
  for (const task of report.tasks) {
    lines.push('', `${markdown ? '## ' : ''}${cell(task.package)}#${cell(task.task)} (cache: ${task.cache === null ? 'unknown' : task.cache})`)
    for (const variable of task.variables) {
      const source = variable.evidence.map(item => `${cell(item.path)}:${item.line}:${item.column}`).join(', ')
      lines.push(`- ${cell(variable.name)}: ${variable.coverage} — ${source}`)
    }
    for (const file of task.files) {
      lines.push(`- File ${cell(file.path)}: ${file.coverage}`)
    }
  }
  lines.push('', markdown ? '## Findings' : 'Findings')
  for (const finding of report.findings) {
    lines.push(`- [${finding.suppression ? 'suppressed' : finding.severity}] ${finding.rule}: ${cell(finding.package)}${finding.task ? `#${cell(finding.task)}` : ''}${finding.variable ? ` ${cell(finding.variable)}` : ''}${finding.path ? ` ${cell(finding.path)}${finding.line ? `:${finding.line}` : ''}` : ''} — ${cell(finding.message)}${finding.suppression ? ` Reason: ${cell(finding.suppression.reason)}` : ''}`)
  }
  lines.push('', markdown ? '## Scan limits' : 'Scan limits', ...report.limitations.map(item => `- ${item}`))
  return lines.join('\n')
}
