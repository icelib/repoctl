import type { Command } from '@icebreakers/monorepo-templates'
import type { DoctorReport } from '../../../commands/doctor'
import process from 'node:process'
import path from 'pathe'
import { logger } from '../../../core/logger'
import { localize } from '../../../i18n'
import fs from '../../../utils/fs'
import { createDoctorReportOutput, createInteractiveDoctorReportOutput, hasDoctorBlockingIssues } from './output'

interface DoctorCliOptions {
  json?: boolean
  markdown?: boolean
  out?: string
  redact?: boolean
  strict?: boolean
  rules?: string
  listRules?: boolean
  fix?: boolean
  apply?: string
}

async function emitDoctorReport(report: DoctorReport, opts: DoctorCliOptions, cwd: string) {
  const content = opts.json || opts.markdown || opts.out
    ? createDoctorReportOutput(report, opts)
    : createInteractiveDoctorReportOutput(report, opts)

  if (!opts.out) {
    if (opts.json || opts.markdown) {
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

export function registerDoctorCommand(program: Command, cwd: string) {
  program.command('doctor')
    .description(localize('Diagnose whether the current repository is ready to use', '诊断当前仓库是否适合直接开始使用'))
    .option('--json', localize('Output JSON for CI or scripts', '输出 JSON 报告，方便 CI 或脚本消费'))
    .option('--markdown', localize('Output Markdown for an issue or pull request', '输出 Markdown 报告，方便粘贴到 issue 或 PR'))
    .option('--out <file>', localize('Write the diagnostic report to a file', '把诊断报告写入文件'))
    .option('--redact', localize('Redact workspace, cwd, and home paths', '脱敏 workspace/cwd/home 绝对路径后再输出'))
    .option('--strict', localize('Treat warnings as failures', '把 warning 也视为失败，适合 CI 门禁'))
    .option('--rules <ids>', localize('Select exact check IDs, separated by commas', '选择精确检查 ID，以逗号分隔'))
    .option('--list-rules', localize('List all available check IDs', '列出全部可用检查 ID'))
    .option('--fix', localize('Preview safe fixes without writing', '预览安全修复，不写入文件'))
    .option('--apply <plan>', localize('Apply a reviewed doctor fix JSON plan', '应用已审核的 doctor 修复 JSON 计划'))
    .action(async (opts: DoctorCliOptions) => {
      const commands = await import('@/commands')
      if ((opts.fix && opts.apply) || (opts.apply && opts.rules !== undefined) || (opts.listRules && (opts.fix || opts.apply || opts.rules !== undefined))) {
        throw new Error('Use one of --list-rules, --fix, or --apply; --apply cannot change the reviewed rule selection.')
      }
      if (opts.listRules || opts.fix || opts.apply) {
        if (opts.markdown || opts.redact) {
          throw new Error('--markdown and --redact apply to diagnostic reports, not rule lists or executable plans.')
        }
        const result = opts.listRules
          ? commands.getDoctorRuleIds()
          : opts.apply
            ? await commands.applyDoctorFixPlan(cwd, await fs.readJson(path.resolve(cwd, opts.apply)))
            : await commands.planDoctorFix(cwd, opts.rules === undefined ? {} : { rules: opts.rules.split(',') })
        const content = `${JSON.stringify(result, null, 2)}\n`
        if (opts.out) {
          await fs.outputFile(path.resolve(cwd, opts.out), content, 'utf8')
        }
        else {
          process.stdout.write(content)
        }
        if ('verification' in result && hasDoctorBlockingIssues(result.verification, opts)) {
          process.exitCode = 1
        }
        return
      }
      const report = opts.rules === undefined ? await commands.runDoctor(cwd) : await commands.runDoctor(cwd, { rules: opts.rules.split(',') })
      await emitDoctorReport(report, opts, cwd)
      if (opts.out || opts.json || opts.markdown) {
        if (hasDoctorBlockingIssues(report, opts)) {
          process.exitCode = 1
        }
        return
      }

      if (report.summary.fail > 0) {
        logger.error(localize(`Doctor found ${report.summary.fail} blocking issue(s).`, `Doctor 发现 ${report.summary.fail} 个阻断问题。`))
        process.exitCode = 1
        return
      }

      if (report.summary.warn > 0) {
        if (opts.strict) {
          logger.error(localize(`Doctor found ${report.summary.warn} warning(s) in strict mode.`, `严格模式下 doctor 发现 ${report.summary.warn} 个警告。`))
          process.exitCode = 1
          return
        }
        logger.warn(localize(`Doctor found ${report.summary.warn} suggestion(s).`, `Doctor 提供了 ${report.summary.warn} 条建议。`))
      }
      logger.success(localize('Doctor finished.', 'Doctor 诊断完成。'))
    })
}
