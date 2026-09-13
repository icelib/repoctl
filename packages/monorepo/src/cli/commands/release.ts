import type { Command } from '@icebreakers/monorepo-templates'
import type { ReleaseOptions } from '../../commands/release/types'
import process from 'node:process'
import { resolveCommandConfig } from '../../core/config'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'

async function runReleaseAction(action: () => void | Promise<void>) {
  try {
    await action()
  }
  catch (error) {
    logger.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function resolveReleaseOptions(cwd: string): Promise<ReleaseOptions> {
  const config = await resolveCommandConfig('release', cwd)
  return {
    cwd,
    ...(config ? { config } : {}),
  }
}

export function registerReleaseCommands(program: Command, cwd: string) {
  const releaseCommand = program.command('release').description(localize('Release and pnpm versioning commands', '发布与 pnpm versioning 工具集'))

  releaseCommand.command('ci')
    .description(localize('Prepare, publish, or recover versions in CI', '在 CI 中自动准备、发布和恢复版本'))
    .option('--mode <mode>', localize('auto / prepare / publish / publish-unpublished / reconcile', 'auto / prepare / publish / publish-unpublished / reconcile'), 'auto')
    .option('--package <name>', localize('Package used by publish-unpublished mode', 'publish-unpublished 使用的 package'))
    .option('--version <version>', localize('Version used by publish-unpublished mode', 'publish-unpublished 使用的版本'))
    .option('--dry-run', localize('Preview reconcile changes without updating GitHub', '只预览 reconcile 变更，不更新 GitHub'))
    .action(async (opts: { mode?: 'auto' | 'prepare' | 'publish' | 'publish-unpublished' | 'reconcile', package?: string, version?: string, dryRun?: boolean }) => {
      await runReleaseAction(async () => {
        const { releaseCi } = await import('@/commands')
        const releaseOptions = await resolveReleaseOptions(cwd)
        await releaseCi({
          ...releaseOptions,
          ...(opts.mode ? { mode: opts.mode } : {}),
          ...(opts.package ? { packageName: opts.package } : {}),
          ...(opts.version ? { packageVersion: opts.version } : {}),
          ...(opts.dryRun ? { dryRun: true } : {}),
        })
        logger.success(localize('Release CI finished.', 'Release CI 完成。'))
      })
    })

  const notesCommand = releaseCommand.command('notes').description(localize('Manage GitHub Release notes', '维护 GitHub Release 正文'))
  notesCommand.command('repair')
    .description(localize('Rebuild GitHub Release notes from the changelog for each release tag', '按每个发布 tag 对应的 changelog 重建 GitHub Release 正文'))
    .option('--all', localize('Repair every recognized GitHub Release', '修复所有可识别的 GitHub Release'))
    .option('--tag <package@version>', localize('Repair only the specified package@version', '只修复指定 package@version'))
    .option('--dry-run', localize('Generate and summarize without updating GitHub Releases', '只生成并统计，不更新 GitHub Release'))
    .action(async (opts: { all?: boolean, tag?: string, dryRun?: boolean }) => {
      await runReleaseAction(async () => {
        const { repairReleaseNotes } = await import('@/commands')
        const result = await repairReleaseNotes({
          cwd,
          ...(opts.all ? { all: true } : {}),
          ...(opts.tag ? { tag: opts.tag } : {}),
          ...(opts.dryRun ? { dryRun: true } : {}),
        })
        logger.success(localize(
          `Release notes repaired: ${result.repaired.length}; skipped: ${result.skipped.length}`,
          `Release 正文已修复：${result.repaired.length}；已跳过：${result.skipped.length}`,
        ))
      })
    })

  const stableCommand = releaseCommand.command('stable')
    .description(localize('Run a stable release from main', '在 main 分支执行正式发布'))
    .action(async () => {
      await runReleaseAction(async () => {
        const { releaseCi } = await import('@/commands')
        await releaseCi({ ...await resolveReleaseOptions(cwd), mode: 'publish' })
        logger.success(localize('Stable release finished.', '稳定版发布完成。'))
      })
    })

  stableCommand.command('prepare')
    .description(localize('Consume pnpm change intents and prepare a Release PR', '消费 pnpm change intents 并准备 Release PR'))
    .action(async () => {
      await runReleaseAction(async () => {
        const { releaseCi } = await import('@/commands')
        await releaseCi({ ...await resolveReleaseOptions(cwd), mode: 'prepare' })
        logger.success(localize('Stable release preparation finished.', '稳定版发布准备完成。'))
      })
    })

  stableCommand.command('publish')
    .description(localize('Publish versions on main that are not yet on npm', '发布 main 分支上尚未发布的包'))
    .action(async () => {
      await runReleaseAction(async () => {
        const { releaseCi } = await import('@/commands')
        await releaseCi({ ...await resolveReleaseOptions(cwd), mode: 'publish' })
        logger.success(localize('Stable package publish finished.', '稳定版包发布完成。'))
      })
    })

  const preCommand = releaseCommand.command('pre').description(localize('Run or manage prereleases', '执行或管理 prerelease 发布'))

  preCommand.command('publish')
    .alias('run')
    .description(localize('Publish a prerelease from an alpha, beta, rc, or next lane', '在 alpha/beta/rc/next 分支发布 prerelease'))
    .action(async () => {
      await runReleaseAction(async () => {
        const { releaseCi } = await import('@/commands')
        await releaseCi(await resolveReleaseOptions(cwd))
        logger.success(localize('Prerelease finished.', '预发布完成。'))
      })
    })

  preCommand.command('enter')
    .description(localize('Enter a pnpm prerelease lane', '进入 pnpm prerelease lane'))
    .argument('<tag>', localize('alpha / beta / rc / next', 'alpha / beta / rc / next'))
    .action(async (tag: string) => {
      await runReleaseAction(async () => {
        const { enterPrerelease } = await import('@/commands')
        await enterPrerelease(tag, { cwd })
        logger.success(localize(`Entered ${tag} prerelease mode.`, `已进入 ${tag} 预发布模式。`))
      })
    })

  preCommand.command('exit')
    .description(localize('Exit the pnpm prerelease lane', '退出 pnpm prerelease lane'))
    .action(async () => {
      await runReleaseAction(async () => {
        const { exitPrerelease } = await import('@/commands')
        await exitPrerelease({ cwd })
        logger.success(localize('Exited prerelease mode.', '已退出预发布模式。'))
      })
    })
}
