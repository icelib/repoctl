import type { Command } from '@icebreakers/monorepo-templates'
import type { WorkspaceTaskCatalog } from '../../../core/workspace-tasks'
import process from 'node:process'
import { select } from '@icebreakers/monorepo-templates'
import { getWorkspaceTaskCatalog, locateWorkspace } from '../../../core/workspace-tasks'
import { localize } from '../../../i18n'

function formatCatalog(catalog: WorkspaceTaskCatalog) {
  return catalog.packages.flatMap(pkg => [
    `${pkg.name ?? '(unnamed)'} (${pkg.id})${pkg.root ? ' [root]' : ''}${pkg.private ? ' [private]' : ''}`,
    ...(pkg.tasks.length
      ? pkg.tasks.map(task => `  ${task.name}: ${task.command}`)
      : [localize('  (no scripts)', '  （无脚本）')]),
  ]).join('\n') || localize('No workspace matches the requested query/script.', '没有工作区符合指定查询或脚本。')
}

export function registerWorkspaceTasks(workspace: Command, cwd: string) {
  workspace.command('tasks')
    .description(localize('Discover workspace scripts without running them', '发现工作区脚本，不执行任务'))
    .argument('[query]', localize('Search name, path, description or task name', '搜索名称、路径、说明或任务名'))
    .option('--script <name>', localize('Require an exact script name', '筛选实际包含指定脚本的工作区'))
    .option('--no-private', localize('Exclude private workspaces', '排除私有工作区'))
    .option('--no-root', localize('Exclude root scripts', '排除根级脚本'))
    .option('--json', localize('Output a versioned JSON catalog', '输出有版本结构的 JSON 任务目录'))
    .action(async (query: string | undefined, options: { script?: string, private: boolean, root: boolean, json?: boolean }) => {
      const catalog = await getWorkspaceTaskCatalog(cwd, {
        ...(query !== undefined ? { query } : {}),
        ...(options.script !== undefined ? { script: options.script } : {}),
        includePrivate: options.private,
        includeRoot: options.root,
      })
      process.stdout.write(`${options.json ? JSON.stringify(catalog, null, 2) : formatCatalog(catalog)}\n`)
      if (!catalog.packages.length) {
        process.exitCode = 1
      }
    })

  workspace.command('locate')
    .description(localize('Print one workspace path; report ambiguous matches', '输出唯一工作区路径；明确报告模糊匹配歧义'))
    .argument('<query>', localize('Workspace name, path or search text', '工作区名称、路径或搜索文本'))
    .option('--json', localize('Output status and candidates as JSON', '以 JSON 输出状态及候选项'))
    .option('-i, --interactive', localize('Choose an ambiguous result in an interactive terminal', '在交互终端选择存在歧义的结果'))
    .action(async (query: string, options: { json?: boolean, interactive?: boolean }) => {
      const result = await locateWorkspace(cwd, query)
      const ci = ![undefined, '', 'false', '0'].includes(process.env['CI']?.trim().toLowerCase())
      if (result.status === 'ambiguous' && options.interactive && !options.json && !ci && process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY) {
        const id = await select({
          message: localize('Select a workspace', '选择工作区'),
          choices: result.candidates.map(pkg => ({ name: `${pkg.name ?? '(unnamed)'} (${pkg.id})`, value: pkg.id })),
        }, { output: process.stderr })
        result.candidates = result.candidates.filter(pkg => pkg.id === id)
        result.status = 'found'
      }
      if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      }
      else if (result.status === 'found') {
        process.stdout.write(`${result.candidates[0]!.directory}\n`)
      }
      else {
        process.stderr.write(`${result.status}: ${query}\n${result.candidates.map(pkg => `  ${pkg.name ?? '(unnamed)'} (${pkg.id})`).join('\n')}\n`)
      }
      if (result.status !== 'found') {
        process.exitCode = 1
      }
    })
}
