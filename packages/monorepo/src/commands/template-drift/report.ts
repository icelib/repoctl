import type { TemplateDriftReport } from './types'

const cell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ').replaceAll('\r', '')

export function hasTemplateDriftIssues(report: TemplateDriftReport, strict = false) {
  return report.summary.fail > 0 || (strict && report.summary.warn > 0)
}

export function formatTemplateDriftReport(report: TemplateDriftReport) {
  const lines = [
    '# Template drift report',
    '',
    `Workspace: ${cell(report.workspaceDir)}`,
    '',
    `Comparison: ${report.evidence.kind} / ${report.evidence.status} / ${report.evidence.version ?? 'unknown'}. ${cell(report.evidence.detail)}`,
    '',
    `Instance registry: ${report.instanceRegistry.status}. ${cell(report.instanceRegistry.detail)}`,
    '',
    `Root baseline registry: ${report.rootRegistry.status}. ${cell(report.rootRegistry.detail)}`,
    '',
    '| Instance or root asset | Source | Retained version | Baseline | Version comparison | Local state |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.owners.map(owner => `| ${cell(`${owner.id} (${owner.path})`)} | ${cell(`${owner.source.packageName ?? owner.source.kind}:${owner.source.templatePath}`)} | ${cell(owner.source.version ?? 'unversioned')} | ${owner.baseline.status} | ${owner.version.status} | ${owner.local} |`),
    '',
    '| Rule | Path | Status | Detail | Recommendation | Suppression |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.checks.map(check => `| ${check.id} | ${cell(check.path ?? '-')} | ${check.status} | ${cell(check.detail)} | ${cell(check.fix ?? '-')} | ${cell(check.suppression ? `${check.suppression.state}: ${check.suppression.reason}${check.suppression.expires ? ` (expires ${check.suppression.expires})` : ''}` : '-')} |`),
    '',
    `Effective: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail. Raw: ${report.rawSummary.pass} pass, ${report.rawSummary.warn} warn, ${report.rawSummary.fail} fail.`,
  ]
  for (const owner of report.owners) {
    for (const recommendation of owner.recommendations) {
      lines.push('', `- ${cell(owner.path)}: ${cell(recommendation)}`)
    }
  }
  for (const suppression of report.suppressions) {
    lines.push('', `Suppression ${suppression.id}${suppression.path ? ` (${cell(suppression.path)})` : ''}: ${suppression.state}, ${suppression.matched} matched; ${cell(suppression.reason)}.`)
  }
  return lines.join('\n')
}
