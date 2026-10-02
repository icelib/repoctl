import type { Command } from '@icebreakers/monorepo-templates'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { checkDependencyAdmission } from '../../../commands/deps/admission'
import { localize } from '../../../i18n'

export function registerDependencyAdmission(deps: Command, cwd: string) {
  deps.command('policy')
    .description(localize('Check direct third-party dependency admission', '检查第三方直接依赖准入规则'))
    .option('--json', localize('Output stable JSON', '输出稳定 JSON'))
    .option('--baseline <file>', localize('Compare a reviewed report; missing or incompatible baselines fail', '对比已审核报告；缺失或不兼容基线将失败'))
    .option('--full', localize('Explicitly check all violations, ignoring a baseline', '显式检查全部违规，不使用基线'))
    .option('--strict', localize('Also fail on warnings', '警告也返回失败'))
    .action(async (options: { json?: boolean, baseline?: string, full?: boolean, strict?: boolean }) => {
      let baseline: unknown
      if (options.baseline && !options.full) {
        try {
          baseline = JSON.parse(await readFile(options.baseline, 'utf8'))
        }
        catch {
          throw new Error('Cannot read the dependency policy baseline. Supply a valid report or explicitly use --full.')
        }
      }
      const report = await checkDependencyAdmission(cwd, { ...(options.baseline && !options.full ? { baseline } : {}), ...(options.full ? { full: true } : {}) })
      if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      }
      else {
        for (const finding of report.findings) {
          const item = finding.declaration
          process.stdout.write(`[${finding.baseline}/${finding.status}] ${finding.rule || finding.id}${item ? ` ${item.path} ${item.section}.${item.name} -> ${item.target ?? '?'}` : ''}\n  ${finding.detail}${finding.reason ? ` ${finding.reason}` : ''}${finding.alternative ? ` Alternative: ${finding.alternative}` : ''}\n`)
        }
        for (const exception of report.exceptions) {
          process.stdout.write(`[waived] ${exception.rule}: ${exception.workspace} ${exception.section}.${exception.dependency}: ${exception.reason}\n`)
        }
        process.stdout.write(`${report.mode}: ${report.summary.fail} fail, ${report.summary.warn} warn, ${report.summary.existing} existing, ${report.summary.waived} waived\n`)
      }
      if (report.summary.fail || (options.strict && report.summary.warn)) {
        process.exitCode = 1
      }
    })
}
