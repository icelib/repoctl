import type { Command } from '@icebreakers/monorepo-templates'
import process from 'node:process'
import { syncNpmMirror } from '../../../commands/release/npmmirror'
import { reportSync } from '../../../commands/release/npmmirror/report'
import { localize } from '../../../i18n'

export function registerNpmMirror(release: Command, cwd: string) {
  release.command('sync-npmmirror')
    .description(localize('Sync published npm packages to npmmirror using its HTTP API', '通过 HTTP API 同步已发布 npm 包到 npmmirror'))
    .option('--published', localize('Use the afterPublish package list or summary', '使用 afterPublish 发布包列表或摘要'))
    .option('--all', localize('Sync all public workspace packages from npm dist-tags', '按 npm dist-tag 同步 workspace 全部公开包'))
    .option('--package <name>', localize('Sync one public npm package', '同步一个公开 npm 包'))
    .option('--version <version>', localize('Specific published version; requires --package', '指定已发布版本，须配合 --package'))
    .option('--dry-run', localize('Preview targets without creating sync tasks', '预览目标，不创建同步任务'))
    .option('--timeout <seconds>', localize('Total time budget in seconds', '本次同步的总时间上限（秒）'), '300')
    .action(async (opts: { published?: boolean, all?: boolean, package?: string, version?: string, dryRun?: boolean, timeout: string }) => {
      try {
        const results = await syncNpmMirror({
          cwd,
          ...opts,
          ...(opts.package !== undefined ? { packageName: opts.package } : {}),
          timeout: Number(opts.timeout),
        })
        await reportSync(results, process.env, opts.dryRun)
        if (results.some(result => result.state === 'failed')) {
          process.exitCode = 1
        }
      }
      catch (error) {
        await reportSync([], process.env, opts.dryRun, error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    })
}
