import type { Command } from '@icebreakers/monorepo-templates'
import process from 'node:process'
import { installGitHooks } from '../../../commands/hooks'
import { logger } from '../../../core/logger'
import { localize } from '../../../i18n'

export function registerHooksCommands(toolingCommand: Command, cwd: string) {
  toolingCommand.command('hooks')
    .description(localize('Install native Git hooks safely', '安全安装原生 Git hooks'))
    .command('install')
    .option('--json')
    .action(async (options: { json?: boolean }) => {
      const result = await installGitHooks(cwd)
      if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      }
      else if (result.status === 'installed') {
        logger.success(localize('Git hooks installed.', 'Git hooks 安装完成。'))
      }
      else {
        logger.info(localize(`Git hooks installation skipped: ${result.reason}.`, `已跳过 Git hooks 安装：${result.reason}。`))
      }
    })
}
