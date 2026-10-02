import type { CheckExecutionReport } from '../../../commands/check/types'
import os from 'node:os'
import { formatAffectedCheckPlan } from './affected'

export function createCheckReportOutput(report: CheckExecutionReport, format: 'json' | 'markdown', redact = false) {
  let serialized = JSON.stringify(report)
  if (redact) {
    const replacements: Array<[string, string]> = [[report.cwd, '<cwd>'], [os.homedir(), '<home>']]
    for (const [value, replacement] of replacements.sort(([a], [b]) => b.length - a.length)) {
      if (value) {
        // JSON encoding also handles Windows backslashes without changing the structure.
        serialized = serialized.split(JSON.stringify(value).slice(1, -1)).join(replacement)
      }
    }
  }
  const output = JSON.parse(serialized) as CheckExecutionReport
  if (format === 'json') {
    return JSON.stringify(output, null, 2)
  }
  const cell = (value: unknown) => String(value ?? '-').replaceAll('|', '\\|').replaceAll('\n', '<br>')
  return [
    '# Repo check execution report',
    '',
    `- Mode: ${output.mode}`,
    `- Status: ${output.status}`,
    `- Directory: ${output.cwd}`,
    `- Started: ${output.startedAt}`,
    `- Ended: ${output.endedAt}`,
    `- Duration: ${output.durationMs.toFixed(1)} ms`,
    `- Exit code: ${output.exitCode}`,
    '',
    '| Task | Command | Status | Duration (ms) | Exit code | Signal | Reason |',
    '| --- | --- | --- | ---: | ---: | --- | --- |',
    ...output.tasks.map(task => `| ${[task.name, [task.executable, ...task.args].join(' '), task.status, task.durationMs.toFixed(1), task.exitCode, task.signal, task.reason ?? task.errorCode].map(cell).join(' | ')} |`),
    ...(output.affectedPlan ? ['', formatAffectedCheckPlan(output.affectedPlan, true)] : []),
  ].join('\n')
}
