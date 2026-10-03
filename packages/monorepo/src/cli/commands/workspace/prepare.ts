import type { Command } from '@icebreakers/monorepo-templates'
import type { WorkspaceArtifactOptions } from '../../../types/artifact'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { applyWorkspaceArtifactPlan, planWorkspaceArtifact } from '../../../commands/workspace/artifact'
import { localize } from '../../../i18n'

interface PrepareOptions {
  mode?: WorkspaceArtifactOptions['mode']
  out?: string
  entry?: string
  docker?: boolean
  offline?: boolean
  legacy?: boolean
  json?: boolean
  dryRun?: boolean
  apply?: string
}

export function registerWorkspacePrepare(command: Command, cwd: string) {
  command.command('prepare [target]')
    .description(localize('Preview isolated Turbo prune or production pnpm deploy artifacts', '预览隔离的 Turbo prune 或生产 pnpm deploy 产物'))
    .option('--mode <mode>', localize('prune for a build context; deploy for a production directory', 'prune 生成构建上下文，deploy 生成生产目录'))
    .option('--out <directory>', localize('Explicit empty output directory outside the workspace', '工作区外的显式空输出目录'))
    .option('--entry <file>', localize('Built deploy entry relative to the package', '相对包目录的已构建部署入口'))
    .option('--docker', localize('Split prune output into Docker layers', '将 prune 产物分成 Docker 缓存层'))
    .option('--offline', localize('Deploy only from local package stores', '部署仅使用本地包存储'))
    .option('--legacy', localize('Explicitly select native legacy deploy', '显式使用原生 legacy deploy'))
    .option('--json', localize('Output the portable JSON plan', '输出可保存的 JSON 计划'))
    .option('--dry-run', localize('Explicitly preview without creating artifacts (default)', '显式只读预览，不创建产物（默认）'))
    .option('--apply <plan.json>', localize('Apply a reviewed saved plan', '应用已审查的保存计划'))
    .action(async (target: string | undefined, options: PrepareOptions, current: Command) => {
      const inherited = current.optsWithGlobals<PrepareOptions>()
      if (options.apply) {
        if (target || options.mode || options.out || options.entry || options.docker || options.offline || options.legacy || inherited.dryRun) {
          throw new Error('--apply cannot be combined with a target, preview selection or --dry-run.')
        }
        const result = await applyWorkspaceArtifactPlan(cwd, JSON.parse(await readFile(path.resolve(cwd, options.apply), 'utf8')))
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
        return
      }
      if (!target || !options.mode || !options.out) {
        throw new Error('Preview requires one exact target, --mode prune|deploy and --out <directory>.')
      }
      const plan = await planWorkspaceArtifact(cwd, { target, mode: options.mode, output: options.out, ...(options.entry ? { entry: options.entry } : {}), ...(options.docker ? { docker: true } : {}), ...(options.offline ? { offline: true } : {}), ...(options.legacy ? { legacy: true } : {}) })
      process.stdout.write(`${inherited.json
        ? JSON.stringify(plan, null, 2)
        : [
            `${plan.selection.mode}: ${plan.target.name}`,
            `output: ${plan.selection.output}`,
            `native: ${plan.tool.name}@${plan.tool.version}`,
            `command: ${[plan.command.executable, ...plan.command.args].map(value => JSON.stringify(value)).join(' ')}`,
            `manifest candidates: ${plan.manifestCandidates.join(', ')}`,
            `excluded private inputs: ${plan.excluded.join(', ') || 'none'}`,
            ...plan.notes,
            'Preview only. Save --json outside the source workspace and review it before --apply.',
          ].join('\n')}\n`)
    })
}
