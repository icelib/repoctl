import type { Command } from 'commander'
import type { DocsChannel } from '../../types/docs'
import process from 'node:process'
import { deployDocs, DocsDeploymentError, planDocsDeployment } from '../../commands/docs'
import { localize } from '../../i18n'

interface DocsCliOptions {
  channel: DocsChannel
  sourceSha?: string
  release?: string
  commits?: string[]
  json?: boolean
}

export function registerDocsCommands(program: Command, cwd: string) {
  const docs = program.command('docs').description(localize('Preview and publish release-aligned documentation', '预览及发布与稳定版本一致的文档'))
  for (const action of ['plan', 'deploy'] as const) {
    docs.command(action)
      .description(action === 'plan' ? localize('Inspect documentation publication without side effects', '只读检查文档发布计划') : localize('Build and deploy a verified documentation snapshot', '构建并部署经验证的文档快照'))
      .argument('<site>', localize('Configured documentation site ID', '已配置的文档站点 ID'))
      .requiredOption('--channel <channel>', localize('preview or stable', 'preview 或 stable'))
      .option('--source-sha <sha>', localize('Exact preview commit', '预览源的完整提交 SHA'))
      .option('--release <id>', localize('Persisted stable release completion ID', '稳定发布完成记录 ID'))
      .option('--commits <sha...>', localize('Selected documentation correction commits', '明确挑选的文档修正提交'))
      .option('--json', localize('Print machine-readable JSON', '输出 JSON'))
      .action(async (site: string, input: DocsCliOptions) => {
        const options = {
          cwd,
          site,
          channel: input.channel,
          ...(input.sourceSha ? { sourceSha: input.sourceSha } : {}),
          ...(input.release ? { release: input.release } : {}),
          ...(input.commits ? { commits: input.commits } : {}),
          ...(input.json ? { json: true } : {}),
        }
        try {
          const result = action === 'plan' ? await planDocsDeployment(options) : await deployDocs(options)
          process.stdout.write(`${JSON.stringify(result, null, input.json ? undefined : 2)}\n`)
          if ('eligible' in result && !result.eligible) {
            process.exitCode = 1
          }
        }
        catch (error) {
          if (!(error instanceof DocsDeploymentError)) {
            throw error
          }
          process.stdout.write(`${JSON.stringify(error.report, null, input.json ? undefined : 2)}\n`)
          if (!input.json) {
            process.stderr.write(`${error.message}\n`)
          }
          process.exitCode = 1
        }
      })
  }
}
