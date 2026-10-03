import type { Command } from '@icebreakers/monorepo-templates'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { getMaintenanceWorkflow, prepareMaintenanceUpgrade } from '../../commands/maintenance'
import { localize } from '../../i18n'

export function registerMaintenanceCommands(program: Command, cwd: string) {
  const maintenance = program.command('maintenance').description(localize('Prepare reviewed managed asset upgrades', '准备可审核的受管资产升级'))
  maintenance.command('upgrade')
    .description(localize('Generate a validated patch in a disposable clean checkout', '在一次性干净 checkout 中生成经过校验的补丁'))
    .requiredOption('--base <sha>', localize('Full trusted source commit before the dependency update', '依赖升级前的完整可信提交 SHA'))
    .option('--head <sha>', localize('Exact current source commit (default: HEAD)', '当前精确源码提交（默认 HEAD）'))
    .requiredOption('--out <directory>', localize('Empty artifact directory outside the repository', '仓库外的空产物目录'))
    .action(async (options: { base: string, head?: string, out: string }) => {
      const report = await prepareMaintenanceUpgrade({ cwd, base: options.base, ...(options.head ? { head: options.head } : {}), outputDirectory: path.resolve(cwd, options.out) })
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      if (report.status === 'blocked') {
        process.exitCode = 1
      }
    })
  maintenance.command('workflow')
    .description(localize('Export the opt-in two-job GitHub Actions recipe', '导出按需启用的双 job GitHub Actions 工作流'))
    .requiredOption('--out <file>', localize('New workflow filename; existing files are protected', '新工作流路径；保护已有文件'))
    .action(async (options: { out: string }) => {
      const filename = path.resolve(cwd, options.out)
      await mkdir(path.dirname(filename), { recursive: true })
      await writeFile(filename, await getMaintenanceWorkflow(), { flag: 'wx' })
      process.stdout.write(`${filename}\n`)
    })
}
