import type { Command } from '@icebreakers/monorepo-templates'
import process from 'node:process'
import { checkPackages } from '../../../commands/package-check'
import { localize } from '../../../i18n'

interface Options {
  filter?: string[]
  includePrivate?: boolean
  buildScript?: string
  strict?: boolean
  keepTemp?: boolean
  json?: boolean
}

export function registerPackageCheckCommand(command: Command, cwd: string) {
  command.command('check')
    .description(localize('Build, pack, and test packages as consumers receive them', '构建并校验消费者实际收到的发布 tarball'))
    .option('--filter <selector>', localize('Select packages using pnpm filters (repeatable)', '用 pnpm filter 选择包，可重复传入'), (value: string, values: string[] = []) => [...values, value])
    .option('--include-private', localize('Also check private packages', '同时校验 private 包'))
    .option('--build-script <script>', localize('Workspace build script (default: build)', 'workspace 构建脚本，默认为 build'))
    .option('--strict', localize('Treat warnings as failures', '将 warning 视为失败'))
    .option('--keep-temp', localize('Preserve tarballs and consumers for reproduction', '保留 tarball 和临时消费者，便于复现'))
    .option('--json', localize('Output the complete machine-readable report', '输出完整 JSON 报告'))
    .action(async (options: Options) => {
      const report = await checkPackages({ cwd, ...(options.filter ? { filters: options.filter } : {}), ...options })
      if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      }
      else {
        for (const pkg of report.packages) {
          process.stdout.write(`${pkg.status} ${pkg.name}${pkg.reason ? ` (${pkg.reason})` : ''}\n`)
          for (const diagnostic of pkg.diagnostics.filter(item => item.severity !== 'info')) {
            process.stdout.write(`  ${diagnostic.source}:${diagnostic.code} ${diagnostic.file ?? diagnostic.entry ?? ''} ${diagnostic.message}\n`)
          }
        }
        if (report.retained) {
          process.stdout.write(`${report.temporaryDirectory}\n`)
        }
      }
      if (report.status === 'failed') {
        process.exitCode = 1
      }
    })
}
