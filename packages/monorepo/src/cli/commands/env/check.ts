import type { Command } from '@icebreakers/monorepo-templates'
import process from 'node:process'
import { localize } from '../../../i18n'

export function registerEnvironmentCheck(command: Command, cwd: string) {
  command.command('check [tasks...]')
    .description(localize('Check static environment references against Turbo cache declarations', '检查静态环境变量引用与 Turbo 缓存声明'))
    .option('--json', localize('Output structured findings', '输出结构化诊断'))
    .option('--markdown', localize('Output Markdown to stdout', '向标准输出写入 Markdown'))
    .option('--strict', localize('Fail on warnings as well as errors', '警告也返回失败码'))
    .option('--no-framework-inference', localize('Disable framework prefix assumptions', '不采用框架变量前缀推断'))
    .option('--dry-run', localize('Read-only check (always enabled)', '只读检查（始终启用）'))
    .action(async (tasks: string[], options: { json?: boolean, markdown?: boolean, strict?: boolean, frameworkInference?: boolean }, action: Command) => {
      if (options.json && options.markdown) {
        throw new Error('--json and --markdown cannot be combined')
      }
      const { checkEnvironmentCache } = await import('../../../commands/env-cache')
      const { formatEnvironmentCache } = await import('../../../commands/env-cache/format')
      const report = await checkEnvironmentCache(cwd, { ...(tasks.length ? { tasks } : {}), ...(action.getOptionValueSource('frameworkInference') === 'cli' ? { frameworkInference: options.frameworkInference } : {}) })
      process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : formatEnvironmentCache(report, options.markdown)}\n`)
      if (report.status === 'fail' || (options.strict && report.status === 'warn')) {
        process.exitCode = 1
      }
    })
}
