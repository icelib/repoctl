import type { Command } from '@icebreakers/monorepo-templates'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { applyPublicApiUpdate, checkPublicApi, formatPublicApiReport, planPublicApiUpdate } from '../../../commands/api-report'
import { localize } from '../../../i18n'

interface Options {
  package?: string[]
  json?: boolean
  apply?: string
}

export function registerPublicApiCommands(command: Command, cwd: string) {
  const api = command.command('api').description(localize('Review built public API signatures', '审核构建后的公共 API 签名'))
  api.command('check')
    .description(localize('Read-only comparison with declared API baselines', '只读比较显式声明的 API 基线'))
    .option('--package <selector...>', localize('Exact workspace names or ./paths', '精确工作区名称或 ./路径'))
    .option('--json', localize('Output a stable JSON report', '输出稳定 JSON 报告'))
    .action(async (opts: Options) => {
      const report = await checkPublicApi(cwd, opts.package ? { packages: opts.package } : {})
      process.stdout.write(`${opts.json ? JSON.stringify(report, null, 2) : formatPublicApiReport(report)}\n`)
      if (['changes', 'failed'].includes(report.status)) {
        process.exitCode = 1
      }
    })
  api.command('update')
    .description(localize('Preview baseline updates or apply a reviewed JSON plan', '预览基线更新，或应用审核后的 JSON 计划'))
    .option('--package <selector...>', localize('Exact workspace names or ./paths', '精确工作区名称或 ./路径'))
    .option('--json', localize('Output the reviewed plan as JSON', '以 JSON 输出待审核计划'))
    .option('--apply <plan>', localize('Apply an explicitly reviewed JSON plan file', '应用显式审核过的 JSON 计划文件'))
    .action(async (opts: Options) => {
      if (opts.apply) {
        if (opts.package) {
          throw new Error('--apply uses the package selection in the reviewed plan.')
        }
        const result = await applyPublicApiUpdate(cwd, JSON.parse(await readFile(opts.apply, 'utf8')))
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
        return
      }
      const plan = await planPublicApiUpdate(cwd, opts.package ? { packages: opts.package } : {})
      process.stdout.write(`${opts.json ? JSON.stringify(plan, null, 2) : formatPublicApiReport(plan.report)}\n`)
      if (plan.report.status === 'failed') {
        process.exitCode = 1
      }
    })
}
