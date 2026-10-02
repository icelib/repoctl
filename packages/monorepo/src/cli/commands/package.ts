import type { Command } from '@icebreakers/monorepo-templates'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import { registerPackageCheckCommand } from './package/check'

interface PackageCreateCliOptions {
  template?: string
  dryRun?: boolean
  json?: boolean
  out?: string
}

export function registerPackageCommands(program: Command, cwd: string) {
  const packageCommand = program.command('package').alias('pkg').description(localize('Package commands', '子包命令'))
  registerPackageCheckCommand(packageCommand, cwd)

  packageCommand.command('create')
    .description(localize('Create a new workspace package', '创建一个新的子包'))
    .alias('new')
    .argument('[name]')
    .option('-t, --template <template>', localize('Use a template key without prompting', '直接使用指定模板，跳过模板选择'))
    .option('--dry-run', localize('Preview without writing files', '预览将要创建的目录与 package 信息，不写入文件'))
    .option('--json', localize('Output JSON; implies --dry-run', '以 JSON 输出创建预览，隐含 --dry-run'))
    .option('--out <file>', localize('Write the preview to a file; implies --dry-run', '把创建预览写入文件，隐含 --dry-run'))
    .action(async (inputName: string, opts: PackageCreateCliOptions) => {
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
    })
}
