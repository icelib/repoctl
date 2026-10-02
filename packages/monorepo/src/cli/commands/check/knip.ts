import type { Command } from '@icebreakers/monorepo-templates'
import type { KnipCheckReport } from '../../../types/knip'
import process from 'node:process'
import { localize } from '../../../i18n'

interface KnipCliOptions {
  config?: string
  baseline?: string
  newOnly?: boolean
  production?: boolean
  strict?: boolean
  saveBaseline?: string
  recommendConfig?: boolean
  dryRun?: boolean
  json?: boolean
  timeout?: string
}

function formatReport(report: KnipCheckReport) {
  return [
    `Knip ${report.plan.tool.version ?? '(not installed)'}: ${report.status}; ${report.summary.errors} errors, ${report.summary.warnings} warnings`,
    ...report.findings.map(item => `[${item.severity}] ${item.type} / ${item.workspace}: ${item.file}${item.line !== undefined ? `:${item.line}:${item.column ?? 0}` : ''} ${item.symbol}`),
    ...(report.baseline.status !== 'none' ? [`baseline: ${report.baseline.status}; existing=${report.baseline.existing.length}, added=${report.baseline.added.length}, fixed=${report.baseline.fixed.length}`] : []),
    ...report.diagnostics.map(item => `${item.code}: ${item.message}`),
  ].join('\n')
}

export function registerKnipCheck(check: Command, cwd: string) {
  check.command('knip')
    .description(localize('Explicitly check unused files, exports and dependency declarations with local Knip', '显式使用本地 Knip 检查闲置文件、导出和依赖声明'))
    .option('--config <file>', localize('Use an existing native Knip configuration', '使用现有原生 Knip 配置'))
    .option('--baseline <file>', localize('Compare with a saved baseline relative to the workspace root', '与工作区根目录相对路径下的基线比较'))
    .option('--new-only', localize('Fail only for new error findings; requires --baseline', '仅新增 error 阻断；必须指定 --baseline'))
    .option('--production', localize('Use native Knip production scope', '使用 Knip 原生 production 范围'))
    .option('--strict', localize('Use native per-workspace dependency strictness; also enables production scope', '使用 Knip 原生工作区直接依赖检查；同时启用 production 范围'))
    .option('--save-baseline <file>', localize('Explicitly save current findings; does not suppress their exit status', '显式保存当前问题；不隐藏本次问题的退出码'))
    .option('--recommend-config', localize('Print native configuration suggestions without writing', '只读输出原生配置合并建议'))
    .option('--dry-run', localize('Preview the local tool command without running Knip', '预览本地工具命令，不运行 Knip'))
    .option('--timeout <ms>', localize('Tool timeout in milliseconds (default 120000)', '工具超时毫秒数（默认 120000）'))
    .option('--json', localize('Output the actual report as JSON (use --dry-run for a plan)', '以 JSON 输出实际报告（计划请另加 --dry-run）'))
    .action(async (localOptions: KnipCliOptions) => {
      const inherited = check.opts()
      if (Object.entries(inherited).some(([key, value]) => !['json', 'dryRun'].includes(key) && value !== undefined && value !== false)) {
        throw new Error('Do not combine check knip with parent check modes or execution options.')
      }
      // Commander may consume shared flags in the parent before dispatching this child.
      const opts: KnipCliOptions = { ...inherited, ...localOptions }
      if (opts.saveBaseline && (opts.baseline || opts.newOnly || opts.dryRun || opts.recommendConfig)) {
        throw new Error('--save-baseline cannot be combined with --baseline, --new-only, --dry-run or --recommend-config.')
      }
      if (opts.recommendConfig && (opts.config || opts.baseline || opts.newOnly || opts.timeout || opts.production || opts.strict)) {
        throw new Error('--recommend-config only provides native configuration suggestions; it cannot run or compare an analysis.')
      }
      const { getKnipConfigurationSuggestions, planKnipCheck, runKnipCheck, saveKnipBaseline } = await import('../../../commands/check/knip')
      if (opts.recommendConfig) {
        process.stdout.write(`${JSON.stringify(await getKnipConfigurationSuggestions(cwd), null, 2)}\n`)
        return
      }
      const options = {
        ...(opts.config ? { config: opts.config } : {}),
        ...(opts.baseline ? { baseline: opts.baseline } : {}),
        ...(opts.newOnly !== undefined ? { newOnly: opts.newOnly } : {}),
        ...(opts.production !== undefined ? { production: opts.production } : {}),
        ...(opts.strict !== undefined ? { strict: opts.strict } : {}),
        ...(opts.timeout ? { timeoutMs: Number(opts.timeout) } : {}),
      }
      if (opts.dryRun) {
        const plan = await planKnipCheck(cwd, options)
        process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
        if (plan.status !== 'ready') {
          process.exitCode = 2
        }
        return
      }
      const controller = new AbortController()
      const interrupt = () => controller.abort('SIGINT')
      const terminate = () => controller.abort('SIGTERM')
      process.on('SIGINT', interrupt)
      process.on('SIGTERM', terminate)
      try {
        const report = await runKnipCheck(cwd, { ...options, signal: controller.signal })
        const baselineSaved = opts.saveBaseline && report.status === 'completed' ? await saveKnipBaseline(cwd, report, opts.saveBaseline) : undefined
        const savedText = baselineSaved ? `\nbaseline ${baselineSaved.status}: ${baselineSaved.path}${baselineSaved.cleanupPending.length ? `\nInspect retained temporary files: ${baselineSaved.cleanupPending.join(', ')}` : ''}` : ''
        process.stdout.write(`${opts.json ? JSON.stringify({ ...report, ...(baselineSaved ? { baselineSaved } : {}) }, null, 2) : `${formatReport(report)}${savedText}`}\n`)
        process.exitCode = report.exitCode
      }
      finally {
        process.removeListener('SIGINT', interrupt)
        process.removeListener('SIGTERM', terminate)
      }
    })
}
