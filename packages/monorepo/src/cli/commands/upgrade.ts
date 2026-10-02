import type { Command } from '@icebreakers/monorepo-templates'
import type { UpgradeOptions, UpgradePlan } from '../../types/upgrade'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { applyUpgradePlan, formatUpgradePlan, planUpgrade, upgradeMonorepo } from '../../commands'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'

interface UpgradeCliOptions extends UpgradeOptions { json?: boolean, markdown?: boolean, apply?: string }

export function registerUpgradeCommand(parent: Command, cwd: string, alias?: string) {
  const command = parent.command('upgrade')
    .description(localize('Plan or apply standard repository asset upgrades', '预览或应用仓库标准资产升级'))
    .option('-i,--interactive', localize('Select managed files interactively', '交互式选择受管文件'))
    .option('-c,--core', localize('Synchronize core configuration without GitHub assets', '仅同步核心配置，跳过 GitHub 相关资产'))
    .option('--outDir <dir>', localize('Output directory', '输出目录'))
    .option('-s,--skip-overwrite', localize('Preserve existing files', '保留已存在文件'))
    .option('-y, --yes', localize('Approve changed managed assets', '接受受管资产变更'))
    .option('--overwrite', localize('Approve changed managed assets', '接受受管资产变更'))
    .option('--no-overwrite', localize('Preserve existing assets and legacy metadata', '保留既有资产和旧版迁移元数据'))
    .option('--overwrite-release', localize('Replace a custom release workflow', '替换自定义 release workflow'))
    .option('--dry-run', localize('Preview every change without writes or asset preparation', '预览全部变更，不写文件或准备资产'))
    .option('--json', localize('Output a read-only JSON plan', '输出只读 JSON 计划'))
    .option('--markdown', localize('Output a read-only Markdown plan with diffs', '输出含 diff 的只读 Markdown 计划'))
    .option('--apply <file>', localize('Apply all actionable entries from a reviewed JSON plan', '应用已审核 JSON 计划中的全部变更'))
    .action(async (options: UpgradeCliOptions) => {
      if (options.apply) {
        if (options.dryRun) {
          throw new Error(localize('--apply and --dry-run cannot be combined.', '--apply 和 --dry-run 不能同时使用。'))
        }
        const plan = JSON.parse(await readFile(options.apply, 'utf8')) as UpgradePlan
        const result = await applyUpgradePlan(cwd, plan)
        process.stdout.write(`${options.json ? JSON.stringify(result, null, 2) : `${result.status}: ${result.changed.join(', ')}`}\n`)
        return
      }
      const normalized = { ...options, cwd, ...(options.overwrite === false ? { noOverwrite: true } : {}) }
      if (options.dryRun || options.json || options.markdown) {
        const plan = await planUpgrade(normalized)
        process.stdout.write(`${options.json ? JSON.stringify(plan, null, 2) : formatUpgradePlan(plan, options.markdown ? 'markdown' : 'text')}\n`)
        if (plan.status === 'blocked') {
          process.exitCode = 1
        }
        return
      }
      await upgradeMonorepo(normalized)
      logger.success(alias ? localize('Workspace upgrade finished.', 'Workspace 升级完成。') : localize('Upgrade finished.', '升级完成。'))
    })
  if (alias) {
    command.alias(alias)
  }
  return command
}
