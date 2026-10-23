import type { DocsDeploymentReport } from '../types'
import { appendFile } from 'node:fs/promises'

function escape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('`', '&#96;')
    .replaceAll('|', '&#124;')
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/[[\]()!*_\\~]/g, character => `&#${character.charCodeAt(0)};`)
}

/** One attempt only; user script output and HTTP response bodies never enter this summary. */
export function formatDocsSummary(report: DocsDeploymentReport) {
  const lines = [
    '## Documentation deployment',
    '',
    `Site: \`${escape(report.site)}\` · Channel: \`${escape(report.channel)}\``,
    '',
    `Status: ${escape(report.status)} · Attempt duration: ${report.elapsedMs} ms`,
    '',
    `Started: ${escape(report.startedAt)}`,
    '',
  ]
  if (report.deploymentId) {
    lines.push(`Deployment: \`${escape(report.deploymentId)}\``, '')
  }
  if (report.versionId) {
    lines.push(`Provider version: \`${escape(report.versionId)}\``, '')
  }
  if (report.failedStage) {
    lines.push(`Failed stage: \`${escape(report.failedStage)}\``, '')
  }
  if (report.resumablePhase) {
    lines.push(`Saved phase: \`${escape(report.resumablePhase)}\`. Retry the same deployment to resume.`, '')
    if (report.resumablePhase === 'verifying') {
      lines.push('The provider receipt is saved. Public traffic may already serve that version; the current pointer remains at the previous fully verified deployment until readiness and finalization succeed.', '')
    }
  }
  lines.push('| Stage | Status | Duration (ms) | Operation | Reason |', '| --- | --- | ---: | --- | --- |')
  for (const entry of report.stages) {
    lines.push(`| ${escape(entry.stage)} | ${escape(entry.status)} | ${entry.elapsedMs} | ${escape(entry.operation ?? '')} | ${escape(entry.reason ?? '')} |`)
  }
  for (const entry of report.stages) {
    if (entry.message) {
      lines.push('', `${escape(entry.stage)}: ${escape(entry.message)}`)
    }
  }
  return `${lines.join('\n')}\n`
}

export async function writeDocsSummary(report: DocsDeploymentReport, filename?: string) {
  if (!filename) {
    return
  }
  try {
    await appendFile(filename, formatDocsSummary(report))
  }
  catch {
    // Deployment/state outcomes are already determined; reporting must never replace them.
    report.warnings = [...new Set([...(report.warnings ?? []), 'summary-write-failed' as const])]
  }
}
