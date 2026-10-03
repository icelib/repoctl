import type { Command } from '@icebreakers/monorepo-templates'
import process from 'node:process'
import path from 'pathe'
import { localize } from '../../../i18n'

export function registerCacheAnalysis(check: Command, cwd: string) {
  check.command('cache <current> [previous]')
    .description(localize('Analyze existing Turbo run summaries without running tasks', '只读分析已有 Turbo run summaries'))
    .option('--json', localize('Output structured analysis', '输出结构化分析'))
    .option('--markdown', localize('Output a Markdown report to stdout', '向标准输出写入 Markdown 报告'))
    .option('--slowest <count>', localize('Number of slow tasks (1–100)', '最慢任务数量（1–100）'))
    .option('--dry-run', localize('Read-only analysis (always enabled)', '只读分析（始终启用）'))
    .action(async (current: string, previous: string | undefined, options: { json?: boolean, markdown?: boolean, slowest?: string }, command: Command) => {
      const parent = check.opts<Record<string, unknown>>()
      const incompatible = Object.keys(parent).filter(key => !['json', 'markdown', 'dryRun'].includes(key) && parent[key] !== undefined)
      if (incompatible.length) {
        throw new Error(`check cache does not accept parent execution/plan options: ${incompatible.join(', ')}`)
      }
      const json = options.json || parent['json'] === true
      const markdown = options.markdown || parent['markdown'] === true
      if (json && markdown) {
        throw new Error('--json and --markdown cannot be combined')
      }
      const own = command.opts<{ slowest?: string }>()
      const { analyzeTurboRuns } = await import('../../../commands/check/cache')
      const { formatTurboAnalysis } = await import('../../../commands/check/cache/format')
      const result = await analyzeTurboRuns(path.resolve(cwd, current), {
        ...(previous !== undefined ? { previous: path.resolve(cwd, previous) } : {}),
        ...(own.slowest !== undefined ? { slowest: Number(own.slowest) } : {}),
      })
      process.stdout.write(`${json ? JSON.stringify(result, null, 2) : formatTurboAnalysis(result, markdown)}\n`)
    })
}
