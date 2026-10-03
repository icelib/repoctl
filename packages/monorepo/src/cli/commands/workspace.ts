import type { Command } from '@icebreakers/monorepo-templates'
import type { WorkspacePackageSummaryData } from '../../types'
import os from 'node:os'
import process from 'node:process'
import path from 'pathe'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import fs from '../../utils/fs'
import { normalizeCleanOptions } from '../utils'
import { registerUpgradeCommand } from './upgrade'
import { registerWorkspaceBoundaries } from './workspace/boundaries'
import { registerWorkspaceGraphCommands } from './workspace/graph'
import { registerWorkspaceMove } from './workspace/move'
import { registerWorkspaceOwnersCommand } from './workspace/owners'
import { registerWorkspacePrepare } from './workspace/prepare'
import { registerWorkspaceRemoval } from './workspace/remove'
import { registerWorkspaceTasks } from './workspace/tasks'

interface WorkspaceListCliOptions {
  json?: boolean
  markdown?: boolean
  redact?: boolean
  includePrivate?: boolean
  includeRoot?: boolean
  pattern?: string[]
  out?: string
}

interface WorkspaceCleanCliOptions {
  dryRun?: boolean
  yes?: boolean
  includePrivate?: boolean
  pinnedVersion?: string
}

function collectValues(value: string, previous: string[] = []) {
  return [...previous, value]
}

function formatWorkspaceList(result: WorkspacePackageSummaryData) {
  const lines = [
    localize(`workspace: ${result.workspaceDir}`, `工作区：${result.workspaceDir}`),
    localize(`packages: ${result.packages.length}`, `包数量：${result.packages.length}`),
  ]

  for (const pkg of result.packages) {
    const name = pkg.name ?? localize('(unnamed)', '（未命名）')
    const privateMark = pkg.private ? localize(' private', ' 私有') : ''
    lines.push(`- ${name} ${pkg.relativeDir}${privateMark}`)
  }

  return lines.join('\n')
}

function formatMarkdownCell(value: string | number | boolean | undefined) {
  return String(value ?? '-')
    .split('|')
    .join('\\|')
    .split('\n')
    .join('<br>')
}

function formatMarkdownTable(rows: Array<[string, string | number | boolean | undefined]>) {
  return [
    localize('| Field | Value |', '| 字段 | 值 |'),
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${label} | ${formatMarkdownCell(value)} |`),
  ].join('\n')
}

function formatWorkspaceListMarkdown(result: WorkspacePackageSummaryData) {
  return [
    localize('# Repo workspaces', '# Repo 工作区'),
    '',
    formatMarkdownTable([
      ['cwd', result.cwd],
      ['workspace', result.workspaceDir],
      ['packages', result.packages.length],
    ]),
    '',
    localize('## Packages', '## 包'),
    '',
    localize('| Name | Path | Private | Description |', '| 名称 | 路径 | 私有 | 说明 |'),
    '| --- | --- | --- | --- |',
    ...result.packages.map((pkg) => {
      const name = pkg.name ?? localize('(unnamed)', '（未命名）')
      const description = pkg.description ?? '-'
      return `| ${formatMarkdownCell(name)} | ${formatMarkdownCell(pkg.relativeDir)} | ${pkg.private ? localize('yes', '是') : localize('no', '否')} | ${formatMarkdownCell(description)} |`
    }),
  ].join('\n')
}

function replaceAll(value: string, search: string, replacement: string) {
  return search.length > 0 ? value.split(search).join(replacement) : value
}

function redactWorkspaceValue(value: unknown, replacements: Array<[string, string]>): unknown {
  if (typeof value === 'string') {
    return replacements.reduce((result, [search, replacement]) => replaceAll(result, search, replacement), value)
  }
  if (Array.isArray(value)) {
    return value.map(item => redactWorkspaceValue(item, replacements))
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactWorkspaceValue(item, replacements)]),
    )
  }
  return value
}

function redactWorkspaceList(result: WorkspacePackageSummaryData): WorkspacePackageSummaryData {
  const candidates: Array<[string, string]> = [
    [result.workspaceDir, '<workspace>'],
    [result.cwd, '<cwd>'],
    [os.homedir(), '<home>'],
  ]
  const replacements = candidates
    .filter(([search], index, entries) => search.length > 0 && entries.findIndex(([value]) => value === search) === index)
    .sort(([left], [right]) => right.length - left.length)

  return redactWorkspaceValue(result, replacements) as WorkspacePackageSummaryData
}

async function emitWorkspaceList(result: WorkspacePackageSummaryData, opts: WorkspaceListCliOptions) {
  const outputResult = opts.redact ? redactWorkspaceList(result) : result
  const content = opts.json
    ? JSON.stringify(outputResult, null, 2)
    : opts.markdown
      ? formatWorkspaceListMarkdown(outputResult)
      : formatWorkspaceList(outputResult)

  if (!opts.out) {
    logger.log(content)
    return
  }

  const outFile = path.resolve(process.cwd(), opts.out)
  await fs.outputFile(outFile, `${content}\n`, 'utf8')
  logger.success(localize(`Wrote ${path.relative(process.cwd(), outFile)}`, `已写入 ${path.relative(process.cwd(), outFile)}`))
}

export function registerWorkspaceCommands(program: Command, cwd: string) {
  const workspaceCommand = program.command('workspace').alias('ws').description(localize('Workspace commands', '工作区命令'))
  registerWorkspaceGraphCommands(workspaceCommand, cwd)
  registerWorkspaceBoundaries(workspaceCommand, cwd)
  registerWorkspaceOwnersCommand(workspaceCommand, cwd)

  registerWorkspacePrepare(workspaceCommand, cwd)
  registerWorkspaceTasks(workspaceCommand, cwd)
  registerUpgradeCommand(workspaceCommand, cwd, 'up')
  registerWorkspaceRemoval(workspaceCommand, cwd)
  registerWorkspaceMove(workspaceCommand, cwd)

  workspaceCommand.command('init')
    .description(localize('Initialize workspace metadata and repository files', '初始化工作区元信息（README、package.json、pnpm intent、issue template）'))
    .alias('i')
    .action(async () => {
      const { initMetadata } = await import('@/commands')
      await initMetadata(cwd)
      logger.success(localize('Workspace initialization finished.', 'Workspace 初始化完成。'))
    })

  workspaceCommand.command('list')
    .description(localize('List workspace packages', '列出 workspace 包'))
    .alias('ls')
    .option('--json', localize('Output JSON', '输出 JSON'))
    .option('--markdown', localize('Output Markdown', '输出 Markdown，方便粘贴到 issue 或 PR'))
    .option('--redact', localize('Redact workspace, cwd, and home paths', '脱敏 workspace/cwd/home 绝对路径后再输出'))
    .option('--include-private', localize('Include private packages', '包含 private 包'))
    .option('--include-root', localize('Include the workspace root package', '包含 workspace 根包'))
    .option('-p, --pattern <glob>', localize('Append a workspace glob; repeatable', '追加自定义 workspace glob，可重复'), collectValues)
    .option('--out <file>', localize('Write the package list to a file', '把当前列表输出写入文件'))
    .action(async (opts: WorkspaceListCliOptions) => {
      const { getWorkspacePackageSummaries } = await import('@/core/workspace')
      const result = await getWorkspacePackageSummaries(cwd, {
        ignorePrivatePackage: !opts.includePrivate,
        ignoreRootPackage: !opts.includeRoot,
        ...(opts.pattern?.length ? { patterns: opts.pattern } : {}),
      })

      await emitWorkspaceList(result, opts)
    })

  workspaceCommand.command('clean')
    .description(localize('Remove selected workspace packages', '清除选中的包'))
    .alias('rm')
    .option('-y, --yes', localize('Select all eligible workspace packages without prompting', '跳过交互并选择所有符合条件的工作区包'))
    .option('--dry-run', localize('Preview directory deletions and metadata changes without writing', '预览目录删除和元数据变更，不写入文件'))
    .option('--include-private', localize('Include private packages', '包含 private 包'))
    .option('--pinned-version <version>', localize('Override the repoctl version written to the root package', '覆盖写入的 repoctl 版本'))
    .action(async (opts: WorkspaceCleanCliOptions) => {
      const { cleanProjects } = await import('@/commands')
      await cleanProjects(cwd, normalizeCleanOptions(opts))
    })
}
