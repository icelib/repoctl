import type { Command } from '@icebreakers/monorepo-templates'
import process from 'node:process'
import { formatNightlySummary, releaseNightly } from '../../../commands/release/nightly'
import { resolveCommandConfig } from '../../../core/config'
import { localize } from '../../../i18n'

export function registerNightly(release: Command, cwd: string) {
  release.command('nightly')
    .description(localize('Prepare or publish nightly packages from the default branch in GitHub Actions', '在 GitHub Actions 中从默认分支准备或发布 nightly 包'))
    .option('--publish', localize('Upload verified packages using the configured nightly provider', '使用配置的 nightly 后端上传已验证的包'))
    .option('--dry-run', localize('Only inspect the source, packages and publication state', '只检查源码、候选包和发布状态'))
    .option('--output <directory>', localize('Artifact directory outside the checkout', '源码仓库以外的产物目录'))
    .option('--json', localize('Output a versioned JSON report', '输出有版本结构的 JSON 报告'))
    .action(async (options: { publish?: boolean, dryRun?: boolean, output?: string, json?: boolean }) => {
      try {
        const config = await resolveCommandConfig('release', cwd)
        const report = await releaseNightly({
          cwd,
          ...(config ? { config } : {}),
          ...(options.publish ? { publish: true } : {}),
          ...(options.dryRun ? { dryRun: true } : {}),
          ...(options.output ? { outputDirectory: options.output } : {}),
        })
        process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : formatNightlySummary(report)}\n`)
        if (report.status === 'failed') {
          process.exitCode = 1
        }
      }
      catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
      }
    })
}
