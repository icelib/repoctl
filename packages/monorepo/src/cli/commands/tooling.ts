import type { Command } from '@icebreakers/monorepo-templates'
import type { InitToolingTarget } from '../../commands/init/tooling/types'
import { initToolingTargets } from '../../commands/init/tooling/types'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import { normalizeToolingTargets } from '../utils'
import { registerProjectReferencesCommands } from './tooling/references'

interface ToolingInitCommandOptions {
  all?: boolean
  force?: boolean
}

export function registerToolingCommands(program: Command, cwd: string) {
  const toolingCommand = program.command('tooling').alias('tg').description(localize('Tooling configuration commands', '工程化配置命令'))
  registerProjectReferencesCommands(toolingCommand, cwd)

  toolingCommand.command('init')
    .description(localize(`Generate tooling configuration (${initToolingTargets.join(', ')})`, `生成 tooling 配置（可选值：${initToolingTargets.join(', ')}）`))
    .alias('i')
    .argument('[tooling...]')
    .option('-a, --all', localize('Generate every tooling configuration', '生成全部 tooling 配置'))
    .option('-f, --force', localize('Overwrite existing tooling configuration files', '覆盖已存在的 tooling 配置文件'))
    .action(async (tooling: string[] = [], opts: ToolingInitCommandOptions) => {
      const normalizedTooling: InitToolingTarget[] | undefined = normalizeToolingTargets(tooling)
      const { initTooling } = await import('@/commands')
      await initTooling(cwd, {
        ...(normalizedTooling ? { targets: normalizedTooling } : {}),
        ...(opts.all !== undefined ? { all: opts.all } : {}),
        ...(opts.force !== undefined ? { force: opts.force } : {}),
      })
      logger.success(localize('Tooling initialization finished.', 'Tooling 初始化完成。'))
    })
}
