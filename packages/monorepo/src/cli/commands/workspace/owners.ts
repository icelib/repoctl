import type { Command } from '@icebreakers/monorepo-templates'
import process from 'node:process'
import { applyCodeownersPlan, inspectWorkspaceOwners, planCodeowners } from '../../../core/codeowners'
import { localize } from '../../../i18n'

interface Options {
  file?: string
  sync?: boolean
  dryRun?: boolean
  json?: boolean
}

export function registerWorkspaceOwnersCommand(command: Command, cwd: string) {
  command.command('owners [workspace]')
    .description(localize('Inspect workspace owners and preview CODEOWNERS changes', '查询包负责人并预览 CODEOWNERS 变更'))
    .option('--file <file>', localize('Explicit CODEOWNERS path relative to the workspace root', '显式指定相对工作区根目录的 CODEOWNERS 路径'))
    .option('--sync', localize('Apply the validated preview to the selected file', '把校验过的预览写入指定文件'))
    .option('--dry-run', localize('Preview without writing, including with --sync', '只预览不写入，包括与 --sync 一起使用时'))
    .option('--json', localize('Output JSON', '输出 JSON'))
    .action(async (query: string | undefined, options: Options) => {
      if (options.sync && !options.file) {
        throw new Error('--sync requires an explicit --file.')
      }
      if (query && options.file) {
        throw new Error('CODEOWNERS synchronization covers all configured workspaces; omit the workspace query.')
      }
      const plan = options.file ? await planCodeowners({ cwd, file: options.file }) : undefined
      const report = plan ?? await inspectWorkspaceOwners({ cwd, ...(query ? { query } : {}) })
      const result = options.sync && !options.dryRun && plan && !report.diagnostics.some(item => item.severity === 'error')
        ? await applyCodeownersPlan(plan)
        : undefined
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ ...report, ...(result ? { result } : {}) }, null, 2)}\n`)
      }
      else {
        for (const pkg of report.packages) {
          process.stdout.write(`${pkg.name ?? pkg.path} (${pkg.path}): ${pkg.owners.join(' ') || '(missing)'}\n  ${pkg.sources.join(', ')}\n`)
        }
        for (const diagnostic of report.diagnostics) {
          process.stdout.write(`${diagnostic.severity} ${diagnostic.code} ${diagnostic.source}${diagnostic.line ? `:${diagnostic.line}` : ''}: ${diagnostic.message}\n`)
        }
        if (plan?.diff) {
          process.stdout.write(`${plan.diff}\n`)
        }
        if (result) {
          process.stdout.write(`${result.status} ${result.file}\n`)
        }
      }
      if (report.diagnostics.some(item => item.severity === 'error') || (query && !report.packages.length)) {
        process.exitCode = 1
      }
    })
}
