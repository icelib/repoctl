import type { Command } from '@icebreakers/monorepo-templates'
import type { DoctorReport } from '../../commands/doctor'
import process from 'node:process'
import path from 'pathe'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import fs from '../../utils/fs'
import { registerCheckCommand } from './check'
import { createDoctorReportOutput, createInteractiveDoctorReportOutput, hasDoctorBlockingIssues } from './doctor/output'
import { registerInstallSecurityCommand } from './doctor/security'
import { registerUpgradeCommand } from './upgrade'

interface InitCliOptions {
  force?: boolean
  overwrite?: boolean
  yes?: boolean
  preset?: 'minimal' | 'standard'
}

interface NewCliOptions {
  template?: string
  dryRun?: boolean
  json?: boolean
  out?: string
}

interface DoctorCliOptions {
  json?: boolean
  markdown?: boolean
  out?: string
  redact?: boolean
  strict?: boolean
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

export function registerTopLevelCommands(program: Command, cwd: string) {
  program.command('init')
    .description(localize('Initialize the current workspace with recommended configuration', '初始化当前 workspace，并生成推荐配置'))
    .option('--preset <preset>', localize('Initialization preset: minimal or standard', '初始化预设：minimal / standard'), 'standard')
    .option('-f, --force', localize('Overwrite existing tooling configuration files', '覆盖已存在的 tooling 配置文件'))
    .option('--overwrite', localize('Overwrite existing managed files', '覆盖受管的已存在文件'))
    .option('-y, --yes', localize('Use defaults without prompting; suitable for CI', '使用默认值跳过所有交互，适合 CI'))
    .action(async (opts: InitCliOptions) => {
      const { init } = await import('@/commands')
      await init(cwd, {
        ...(opts.preset !== undefined ? { preset: opts.preset } : {}),
        ...(opts.force !== undefined ? { force: opts.force } : {}),
        ...(opts.overwrite !== undefined ? { overwrite: opts.overwrite } : {}),
        ...(opts.yes !== undefined ? { yes: opts.yes } : {}),
      })
      logger.success(localize('Initialization finished.', '初始化完成。'))
      logger.info(localize('Next: run `pnpm install` and `pnpm build`.', '下一步：运行 `pnpm install` 和 `pnpm build`。'))
    })

  program.command('new')
    .description(localize('Create a new package or application', '创建新的 package / app'))
    .argument('[name]')
    .option('-t, --template <template>', localize('Use a template key without prompting', '直接使用指定模板，跳过模板选择'))
    .option('--dry-run', localize('Preview directories and package metadata without writing', '预览将要创建的目录与 package 信息，不写入文件'))
    .option('--json', localize('Output the creation preview as JSON; implies --dry-run', '以 JSON 输出创建预览，隐含 --dry-run'))
    .option('--out <file>', localize('Write the creation preview to a file; implies --dry-run', '把创建预览写入文件，隐含 --dry-run'))
    .action(async (inputName: string, opts: NewCliOptions) => {
      const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
      const result = await runCreateFlow(cwd, inputName, {
        ...(opts.template !== undefined ? { template: opts.template } : {}),
        ...(opts.dryRun || opts.json || opts.out ? { dryRun: true } : {}),
        ...(opts.json ? { json: true } : {}),
        ...(opts.out !== undefined ? { out: opts.out } : {}),
      })
      if (result.dryRun || result.failed) {
        return
      }
      logger.success(localize('Package creation finished.', '包创建完成。'))
      logger.info(localize('Next: run `pnpm install` and start the new workspace package.', '下一步：运行 `pnpm install`，然后启动新 workspace 包。'))
    })

  registerCheckCommand(program, cwd)

  program.command('doctor')
    .description(localize('Diagnose whether the current repository is ready to use', '诊断当前仓库是否适合直接开始使用'))
    .option('--json', localize('Output JSON for CI or scripts', '输出 JSON 报告，方便 CI 或脚本消费'))
    .option('--markdown', localize('Output Markdown for an issue or pull request', '输出 Markdown 报告，方便粘贴到 issue 或 PR'))
    .option('--out <file>', localize('Write the diagnostic report to a file', '把诊断报告写入文件'))
    .option('--redact', localize('Redact workspace, cwd, and home paths', '脱敏 workspace/cwd/home 绝对路径后再输出'))
    .option('--strict', localize('Treat warnings as failures', '把 warning 也视为失败，适合 CI 门禁'))
    .action(async (opts: DoctorCliOptions) => {
      const { runDoctor } = await import('@/commands')
      const report = await runDoctor(cwd)
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

  registerInstallSecurityCommand(program.commands.find(command => command.name() === 'doctor')!, cwd)
  registerUpgradeCommand(program, cwd)
}
