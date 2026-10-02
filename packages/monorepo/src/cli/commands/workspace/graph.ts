import type { Command } from '@icebreakers/monorepo-templates'
import type { WorkspaceDependencyType } from '../../../core/workspace-graph'
import process from 'node:process'
import { getWorkspaceGraph, getWorkspaceImpact, whyWorkspaceDependency } from '../../../core/workspace-graph'
import { localize } from '../../../i18n'
import { formatWorkspaceGraph, formatWorkspaceGraphMermaid, formatWorkspaceImpact, formatWorkspaceWhy, redactWorkspaceGraph } from './format'

interface GraphCliOptions {
  json?: boolean
  mermaid?: boolean
  redact?: boolean
  includeRoot?: boolean
  excludePrivate?: boolean
  type?: WorkspaceDependencyType[]
  package?: string[]
  direct?: boolean
}

function collect(value: string, previous: string[] = []) {
  return [...previous, value]
}

function commonOptions(command: Command) {
  return command
    .option('--json', localize('Output stable JSON', '输出稳定 JSON'))
    .option('--include-root', localize('Include the workspace root package', '包含 workspace 根包'))
    .option('--exclude-private', localize('Exclude private packages (included by default)', '排除 private 包（默认包含）'))
    .option('--type <type>', localize('Dependency field; repeatable: dependencies, devDependencies, peerDependencies, optionalDependencies', '依赖字段，可重复：dependencies、devDependencies、peerDependencies、optionalDependencies'), collect)
}

async function loadGraph(cwd: string, options: GraphCliOptions) {
  return getWorkspaceGraph(cwd, {
    ignoreRootPackage: !options.includeRoot,
    ignorePrivatePackage: options.excludePrivate ?? false,
    ...(options.type ? { dependencyTypes: options.type } : {}),
    ...(options.package ? { packages: options.package } : {}),
  })
}

export function registerWorkspaceGraphCommands(workspaceCommand: Command, cwd: string) {
  commonOptions(workspaceCommand.command('graph')
    .description(localize('Inspect internal manifest dependencies', '检查清单中的内部依赖关系')))
    .option('--package <selector>', localize('Show a package and its direct relationships; repeatable', '显示指定包及其直接关系，可重复'), collect)
    .option('--mermaid', localize('Output a Mermaid graph', '输出 Mermaid 依赖图'))
    .option('--redact', localize('Redact absolute workspace paths', '脱敏 workspace 绝对路径'))
    .action(async (options: GraphCliOptions) => {
      if (options.json && options.mermaid) {
        throw new Error('--json and --mermaid cannot be combined')
      }
      const graph = await loadGraph(cwd, options)
      const output = options.redact ? redactWorkspaceGraph(graph) : graph
      process.stdout.write(`${options.json ? JSON.stringify(output, null, 2) : options.mermaid ? formatWorkspaceGraphMermaid(output) : formatWorkspaceGraph(output)}\n`)
    })

  commonOptions(workspaceCommand.command('why <from> <to>')
    .description(localize('Explain one shortest dependency path from a consumer to a package', '解释从消费者到目标包的一条最短依赖路径')))
    .action(async (from: string, to: string, options: GraphCliOptions) => {
      const result = whyWorkspaceDependency(await loadGraph(cwd, options), from, to)
      process.stdout.write(`${options.json ? JSON.stringify(result, null, 2) : formatWorkspaceWhy(result)}\n`)
    })

  commonOptions(workspaceCommand.command('impact <package>')
    .description(localize('List direct and transitive consumers of a package', '列出一个包的直接和传递消费者')))
    .option('--direct', localize('Only include direct consumers', '只包含直接消费者'))
    .action(async (selector: string, options: GraphCliOptions) => {
      const result = getWorkspaceImpact(await loadGraph(cwd, options), selector, { direct: options.direct ?? false })
      process.stdout.write(`${options.json ? JSON.stringify(result, null, 2) : formatWorkspaceImpact(result)}\n`)
    })
}
