import type { Command } from '@icebreakers/monorepo-templates'
import process from 'node:process'
import { checkPeerDependencies } from '../../../commands/deps/peers'
import { localize } from '../../../i18n'

export function registerPeerChecks(deps: Command, cwd: string) {
  deps.command('peers')
    .description(localize('Check peer promises against development/test versions', '检查 peer 支持范围与开发测试版本是否兼容'))
    .option('--json', localize('Output a versioned JSON report', '输出带版本的 JSON 报告'))
    .option('--strict', localize('Also fail on unknown compatibility', '无法确定兼容性时也失败'))
    .action(async (options: { json?: boolean, strict?: boolean }) => {
      const report = await checkPeerDependencies(cwd)
      if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      }
      else {
        for (const check of report.checks) {
          process.stdout.write(`[${check.status}] ${check.packageName ?? check.path} / ${check.peer}: ${check.code}\n  peer=${check.peerSpecifier}, dev=${check.testSpecifier ?? '(missing)'}, evidence=${check.evidence}${check.testVersion ? `:${check.testVersion}` : ''}\n  ${check.detail}\n`)
        }
      }
      if (report.summary.fail || (options.strict && report.summary.unknown)) {
        process.exitCode = 1
      }
    })
}
