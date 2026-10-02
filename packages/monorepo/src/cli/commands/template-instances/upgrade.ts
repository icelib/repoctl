import type { Command } from '@icebreakers/monorepo-templates'
import type { OutputOptions } from './output'
import { localize } from '../../../i18n'
import { emitTemplateReport, templateWorkspaceRoot } from './output'

interface UpgradeCliOptions extends OutputOptions {
  sourceVersion: string
  sourceDir?: string
  exclude?: string[]
  apply?: boolean
}

export function registerTemplateUpgradeCommands(templates: Command) {
  templates.command('upgrade')
    .description(localize('Preview a selected template instance upgrade, preserving business changes', '预览所选模板实例的增量升级，保留业务修改'))
    .argument('<instance>', localize('Registered instance ID or target path', '已登记实例 ID 或目标路径'))
    .requiredOption('--source-version <version>', localize('Exact target template package version', '目标模板包的精确版本'))
    .option('--source-dir <directory>', localize('Read an extracted target template package', '只读使用已解压的目标模板包'))
    .option('--exclude <paths...>', localize('Keep these relative files or directories unmanaged in future upgrades', '将这些相对文件或目录持久标记为不受管'))
    .option('--apply', localize('Apply a conflict-free instance upgrade', '应用无冲突的实例升级'))
    .option('--json', localize('Output structured JSON', '输出结构化 JSON'))
    .option('--out <file>', localize('Write the report to a file', '将报告写入文件'))
    .action(async (instance: string, options: UpgradeCliOptions, command: Command) => {
      const { planTemplateUpgrade, applyTemplateUpgradePlan } = await import('../../../commands/template-instances')
      const plan = await planTemplateUpgrade({
        cwd: await templateWorkspaceRoot(),
        instance,
        version: options.sourceVersion,
        ...(options.sourceDir ? { sourceDir: options.sourceDir } : {}),
        ...(options.exclude ? { exclude: options.exclude } : {}),
      })
      await emitTemplateReport(options.apply ? await applyTemplateUpgradePlan(plan) : plan, { ...command.optsWithGlobals(), ...options })
    })

  templates.command('recover-upgrade')
    .description(localize('Inspect or restore an interrupted instance upgrade', '检查或恢复中断的实例升级'))
    .argument('<instance>', localize('Registered instance ID or target path', '已登记实例 ID 或目标路径'))
    .option('--apply', localize('Restore the recorded instance and changed files', '恢复记录中的实例信息及受影响文件'))
    .option('--json', localize('Output structured JSON', '输出结构化 JSON'))
    .option('--out <file>', localize('Write the report to a file', '将报告写入文件'))
    .action(async (instance: string, options: OutputOptions & { apply?: boolean }, command: Command) => {
      const { recoverTemplateUpgrade } = await import('../../../commands/template-instances')
      await emitTemplateReport(await recoverTemplateUpgrade(await templateWorkspaceRoot(), instance, options.apply), { ...command.optsWithGlobals(), ...options })
    })
}
