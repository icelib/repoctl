import type { Command } from '@icebreakers/monorepo-templates'
import type { ReleaseMode, ReleaseOptions } from '../../commands/release/types'
import process from 'node:process'
import { resolveReleaseMode } from '../../commands/release/shared'
import { resolveCommandConfig } from '../../core/config'
import { resolveCommandValues } from '../../core/config/resolution'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import { registerNpmMirror } from './release/npmmirror'
import { registerReleasePlan } from './release/plan'
import { registerSnapshot } from './release/snapshot'

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
  const config = resolveCommandValues('release', await resolveCommandConfig('release', cwd)).values
  return {
    cwd,
    ...(config ? { config } : {}),
  }
}

export function registerReleaseCommands(program: Command, cwd: string) {
  const releaseCommand = program.command('release').description(localize('Release and pnpm versioning commands', '发布与 pnpm versioning 工具集'))
  registerReleasePlan(releaseCommand, cwd)
  registerSnapshot(releaseCommand, cwd)
  registerNpmMirror(releaseCommand, cwd)

  releaseCommand.command('ci')
    .description(localize('Prepare, publish, or recover versions in CI', '在 CI 中自动准备、发布和恢复版本'))
    .option('--mode <mode>', 'auto / prepare / publish / publish-unpublished / reconcile / oidc-audit', 'auto')
    .option('--package <name>', localize('Package used by publish-unpublished mode', 'publish-unpublished 使用的 package'))
    .option('--version <version>', localize('Version used by publish-unpublished mode', 'publish-unpublished 使用的版本'))
    .option('--source-sha <sha>', localize('Recover a prepared release from the selected line history', '从所选发布线的历史提交恢复整批发布'))
    .option('--dry-run', localize('Preview reconcile changes without updating GitHub', '只预览 reconcile 变更，不更新 GitHub'))
    .action(async (opts: { mode?: ReleaseMode, package?: string, version?: string, sourceSha?: string, dryRun?: boolean }) => {
      await runReleaseAction(async () => {
        const { releaseCi } = await import('@/commands')
        const mode = resolveReleaseMode(opts)
        const releaseOptions = mode === 'oidc-audit' ? { cwd } : await resolveReleaseOptions(cwd)
        await releaseCi({
          ...releaseOptions,
          ...(opts.mode ? { mode: opts.mode } : {}),
          ...(opts.package ? { packageName: opts.package } : {}),
          ...(opts.version ? { packageVersion: opts.version } : {}),
          ...(opts.sourceSha ? { sourceSha: opts.sourceSha } : {}),
          ...(opts.dryRun ? { dryRun: true } : {}),
        })
        if (mode !== 'oidc-audit') {
          logger.success(localize('Release CI finished.', 'Release CI 完成。'))
        }
      })
    })

  const notesCommand = releaseCommand.command('notes').description(localize('Manage GitHub Release notes', '维护 GitHub Release 正文'))
  notesCommand.command('repair')
    .description(localize('Rebuild GitHub Release notes from the changelog for each release tag', '按每个发布 tag 对应的 changelog 重建 GitHub Release 正文'))
    .option('--all', localize('Repair every recognized GitHub Release', '修复所有可识别的 GitHub Release'))
    .option('--tag <package@version>', localize('Repair only the specified package@version', '只修复指定 package@version'))
    .option('--dry-run', localize('Generate and summarize without updating GitHub Releases', '只生成并统计，不更新 GitHub Release'))
    .option('--create-missing', localize('Create a missing GitHub Release after validating the published package and tag', '核验已发布 package 和 tag 后补建缺失的 GitHub Release'))
    .action(async (opts: { all?: boolean, tag?: string, dryRun?: boolean, createMissing?: boolean }) => {
      await runReleaseAction(async () => {
        const { repairReleaseNotes } = await import('@/commands')
        const result = await repairReleaseNotes({
          cwd,
          ...(opts.all ? { all: true } : {}),
          ...(opts.tag ? { tag: opts.tag } : {}),
          ...(opts.dryRun ? { dryRun: true } : {}),
          ...(opts.createMissing ? { createMissing: true } : {}),
        })
        logger.success(localize(
          `Release notes repaired: ${result.repaired.length}; skipped: ${result.skipped.length}`,
          `Release 正文已修复：${result.repaired.length}；已跳过：${result.skipped.length}`,
        ))
      })
    })

  const stableCommand = releaseCommand.command('stable')
    .description(localize('Run a stable release from the configured release line', '在配置的正式发布线执行发布'))
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
    .description(localize('Publish prepared versions from the configured release line', '发布所选发布线已经准备的包版本'))
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
    .description(localize('Publish from a configured prerelease branch', '在已配置的预发布分支发布 prerelease'))
    .action(async () => {
      await runReleaseAction(async () => {
        const { releaseCi } = await import('@/commands')
        await releaseCi(await resolveReleaseOptions(cwd))
        logger.success(localize('Prerelease finished.', '预发布完成。'))
      })
    })

  preCommand.command('enter')
    .description(localize('Enter a pnpm prerelease lane', '进入 pnpm prerelease lane'))
    .argument('<tag>', localize('Configured pnpm prerelease lane', '已配置的 pnpm 预发布 lane'))
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
        const target = await exitPrerelease({ cwd })
        logger.success(localize(`Exited prerelease mode. Stable target: ${target.branch}.`, `已退出预发布模式，正式目标分支：${target.branch}。`))
      })
    })
}
