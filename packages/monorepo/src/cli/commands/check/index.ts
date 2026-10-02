import type { Command } from '@icebreakers/monorepo-templates'
import type { RecommendedCheckPlan } from '../../../commands/check'
import type { AffectedCheckPlan } from '../../../commands/check/affected'
import process from 'node:process'
import path from 'pathe'
import { logger } from '../../../core/logger'
import { localize } from '../../../i18n'
import fs from '../../../utils/fs'
import { createCheckPlanOutput } from './output'

interface CheckCliOptions {
  full?: boolean
  staged?: boolean
  affected?: boolean
  base?: string
  head?: string
  filter?: string[]
  globalInput?: string[]
  editFile?: string
  dryRun?: boolean
  json?: boolean
  markdown?: boolean
  out?: string
  redact?: boolean
  report?: string
  reportFormat?: string
}

const collect = (value: string, previous: string[] = []) => [...previous, value]

async function emitCheckPlan(plan: RecommendedCheckPlan | AffectedCheckPlan, opts: CheckCliOptions, cwd: string) {
  const content = createCheckPlanOutput(plan, opts)
  if (!opts.out) {
    if (plan.mode === 'affected') {
      process.stdout.write(`${content}\n`)
    }
    else {
      logger.log(content)
    }
    return
  }
  const outFile = path.resolve(cwd, opts.out)
  await fs.outputFile(outFile, `${content}\n`, 'utf8')
  logger.success(localize(`Wrote ${path.relative(cwd, outFile)}`, `已写入 ${path.relative(cwd, outFile)}`))
}

export function registerCheckCommand(program: Command, cwd: string) {
  program.command('check')
    .description(localize('Run the recommended local verification', '执行推荐的本地校验'))
    .option('--full', localize('Run full verification', '执行完整校验'))
    .option('--staged', localize('Run staged-file verification', '仅执行 staged 相关校验'))
    .option('--affected', localize('Check changed packages and their consumers', '校验变更包及其消费者'))
    .option('--base <ref>', localize('Affected comparison base (default: origin/main)', 'affected 比较基线（默认 origin/main）'))
    .option('--head <ref>', localize('Affected comparison head (default: HEAD)', 'affected 比较终点（默认 HEAD）'))
    .option('--filter <package>', localize('Intersect affected packages with exact names or directories; repeatable', '按精确包名或目录与 affected 集合取交集，可重复'), collect)
    .option('--global-input <glob>', localize('Add a global input glob; repeatable', '追加全局输入 glob，可重复'), collect)
    .option('--edit-file <file>', localize('Validate a commit message file', '执行 commit message 校验'))
    .option('--dry-run', localize('Preview checks without running them', '预览将要执行的校验，不实际运行'))
    .option('--json', localize('Output the check plan as JSON; implies --dry-run', '以 JSON 输出校验计划，隐含 --dry-run'))
    .option('--markdown', localize('Output the check plan as Markdown; implies --dry-run', '以 Markdown 输出校验计划，隐含 --dry-run'))
    .option('--out <file>', localize('Write the check plan to a file; implies --dry-run', '把校验计划写入文件，隐含 --dry-run'))
    .option('--redact', localize('Redact cwd and home paths', '脱敏 cwd/home 绝对路径后再输出'))
    .option('--report <file>', localize('Run checks and write an execution report to a separate file', '执行检查并把实际结果写入独立报告文件'))
    .option('--report-format <format>', localize('Execution report format: json or markdown', '执行报告格式：json / markdown'))
    .action(async (opts: CheckCliOptions) => {
      if (opts.affected && (opts.full || opts.staged || opts.editFile)) {
        throw new Error('--affected cannot be combined with --full, --staged or --edit-file')
      }
      if (!opts.affected && (opts.base || opts.head || opts.filter || opts.globalInput)) {
        throw new Error('--base, --head, --filter and --global-input require --affected')
      }
      const options = {
        cwd,
        ...(opts.full !== undefined ? { full: opts.full } : {}),
        ...(opts.staged !== undefined ? { staged: opts.staged } : {}),
        ...(opts.editFile !== undefined ? { editFile: opts.editFile } : {}),
        ...(opts.affected ? { affected: true } : {}),
        ...(opts.base !== undefined ? { base: opts.base } : {}),
        ...(opts.head !== undefined ? { head: opts.head } : {}),
        ...(opts.filter ? { filters: opts.filter } : {}),
        ...(opts.globalInput ? { globalInputs: opts.globalInput } : {}),
      }
      if (opts.reportFormat && !opts.report) {
        throw new Error('--report-format requires --report <file>')
      }
      if (opts.report) {
        if (opts.dryRun || opts.json || opts.markdown || opts.out) {
          throw new Error('--report cannot be combined with preview options: --dry-run, --json, --markdown, --out')
        }
        const format = opts.reportFormat ?? 'json'
        if (format !== 'json' && format !== 'markdown') {
          throw new Error('--report-format must be json or markdown')
        }
        const { runCheckExecution } = await import('./execute')
        await runCheckExecution(options, opts.report, format, opts.redact)
        return
      }
      const { resolveRecommendedCheckPlan, runRecommendedCheck } = await import('@/commands')
      if (opts.dryRun || opts.json || opts.markdown || opts.out) {
        if (opts.affected) {
          const { resolveAffectedCheckPlan } = await import('@/commands')
          await emitCheckPlan(await resolveAffectedCheckPlan(options), opts, cwd)
          return
        }
        if (opts.full) {
          const { resolveFullWorkspaceCheckPlan } = await import('@/commands')
          await emitCheckPlan(await resolveFullWorkspaceCheckPlan(cwd), opts, cwd)
          return
        }
        await emitCheckPlan(resolveRecommendedCheckPlan(options), opts, cwd)
        return
      }
      if (opts.affected) {
        const { runCheckExecution } = await import('./execute')
        await runCheckExecution(options)
        return
      }
      await runRecommendedCheck(options)
      logger.success(localize('Checks finished.', '检查完成。'))
    })
}
