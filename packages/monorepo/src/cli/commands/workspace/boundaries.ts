import type { Command } from '@icebreakers/monorepo-templates'
import process from 'node:process'
import { checkWorkspaceBoundaries } from '../../../core/workspace-boundaries'
import { localize } from '../../../i18n'

export function registerWorkspaceBoundaries(workspaceCommand: Command, cwd: string) {
  workspaceCommand.command('boundaries')
    .description(localize('Check internal dependency cycles and architecture rules', '检查内部依赖循环与架构规则'))
    .option('--json', localize('Output stable JSON', '输出稳定 JSON'))
    .option('--strict', localize('Fail on warnings as well as errors', '警告和错误均返回失败'))
    .action(async (options: { json?: boolean, strict?: boolean }) => {
      const report = await checkWorkspaceBoundaries(cwd)
      const lines = report.findings.map(finding => `[${finding.status}] ${finding.id}${finding.rule ? ` (${finding.rule})` : ''}: ${finding.detail}`)
      for (const exception of report.exceptions) {
        lines.push(`[waived] ${exception.rule}: ${exception.source} -> ${exception.target} (${exception.type}): ${exception.reason}`)
      }
      lines.push(`${report.summary.fail} fail, ${report.summary.warn} warn, ${report.summary.waived} waived`)
      process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : lines.join('\n')}\n`)
      if (report.summary.fail || (options.strict && report.summary.warn)) {
        process.exitCode = 1
      }
    })
}
