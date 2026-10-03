import type { Command } from '@icebreakers/monorepo-templates'
import { loadMonorepoConfig } from '../../core/config'
import { resolveCommandValues } from '../../core/config/resolution'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import { registerCheckCommand } from './check'
import { registerDoctorCommand } from './doctor'
import { registerUpgradeCommand } from './upgrade'

interface InitCliOptions {
  force?: boolean
  overwrite?: boolean
  yes?: boolean
  preset?: 'minimal' | 'standard'
}

interface NewCliOptions {
  offline?: boolean
  cacheDir?: string
  data?: string
  template?: string
  dryRun?: boolean
  json?: boolean
  out?: string
}

export function registerTopLevelCommands(program: Command, cwd: string) {
  program.command('init')
    .description(localize('Initialize the current workspace with recommended configuration', '初始化当前 workspace，并生成推荐配置'))
    .option('--preset <preset>', localize('Initialization preset: minimal or standard', '初始化预设：minimal / standard'))
    .option('-f, --force', localize('Overwrite existing tooling configuration files', '覆盖已存在的 tooling 配置文件'))
    .option('--overwrite', localize('Overwrite existing managed files', '覆盖受管的已存在文件'))
    .option('-y, --yes', localize('Use defaults without prompting; suitable for CI', '使用默认值跳过所有交互，适合 CI'))
    .action(async (opts: InitCliOptions) => {
      const { init } = await import('@/commands')
      const config = await loadMonorepoConfig(cwd)
      const { preset } = resolveCommandValues('init', config.commands?.init, { preset: opts.preset }, { entry: 'cli' }).values
      await init(cwd, {
        ...(preset !== undefined ? { preset } : {}),
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
    .option('--offline', localize('Use only verified cached remote assets', '只使用通过校验的远程资产缓存'))
    .option('--data <file>', localize('Read typed template parameters from a JSON file', '从 JSON 文件读取类型化模板参数'))
    .option('--cache-dir <directory>', localize('Template asset cache directory', '模板资产缓存目录'))
    .option('-t, --template <template>', localize('Use a template key without prompting', '直接使用指定模板，跳过模板选择'))
    .option('--dry-run', localize('Preview directories and package metadata without writing', '预览将要创建的目录与 package 信息，不写入文件'))
    .option('--json', localize('Output the creation preview as JSON; implies --dry-run', '以 JSON 输出创建预览，隐含 --dry-run'))
    .option('--out <file>', localize('Write the creation preview to a file; implies --dry-run', '把创建预览写入文件，隐含 --dry-run'))
    .action(async (inputName: string, opts: NewCliOptions) => {
      const { runCreateFlow } = await import('@/cli/commands/package/create-flow')
      const result = await runCreateFlow(cwd, inputName, {
        ...(opts.offline !== undefined ? { offline: opts.offline } : {}),
        ...(opts.cacheDir ? { cacheDir: opts.cacheDir } : {}),
        ...(opts.data ? { data: opts.data } : {}),
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

  registerDoctorCommand(program, cwd)

  registerUpgradeCommand(program, cwd)
}
