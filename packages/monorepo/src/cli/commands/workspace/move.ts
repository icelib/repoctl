import type { Command } from '@icebreakers/monorepo-templates'
import type { WorkspaceMovePlan } from '../../../types/move'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { applyWorkspaceMovePlan } from '../../../commands/workspace/move/apply'
import { planWorkspaceMove } from '../../../commands/workspace/move/plan'
import { localize } from '../../../i18n'

interface MoveCliOptions { to?: string, name?: string, json?: boolean, dryRun?: boolean, apply?: string }

function formatPlan(plan: WorkspaceMovePlan) {
  return [
    localize(`Move preview: ${plan.target.id} → ${plan.destination.id}`, `移动预览：${plan.target.id} → ${plan.destination.id}`),
    `name: ${plan.target.name ?? '(unnamed)'} → ${plan.destination.name ?? '(unnamed)'}`,
    ...plan.blockers.map(item => `blocked: ${item.code}: ${item.paths.join(', ')}`),
    ...plan.consumers.map(item => `consumer: ${item.path.join(' → ')}`),
    ...plan.files.flatMap(file => file.fields.map(field => `update: ${file.path}: ${field}`)),
    ...plan.review.tasks.map(item => `review: ${item.path}:${item.line}: ${item.reason}`),
    localize('Review covers Git-tracked text candidates only. Ignored/untracked, binary, large files and dynamic references are not analyzed.', '人工复核覆盖 Git 跟踪文本候选；不分析忽略/未跟踪文件、二进制、大文件或动态引用。'),
    localize('Save the JSON plan outside the selected package and apply it with workspace move --apply <plan.json>.', '将 JSON 计划保存到所选包之外，再运行 workspace move --apply <plan.json>。'),
    ...plan.nextSteps,
  ].join('\n')
}

export function registerWorkspaceMove(workspace: Command, cwd: string) {
  workspace.command('move')
    .alias('mv')
    .description(localize('Preview a workspace directory move, package rename, or both', '预览工作区目录移动、包名修改或两者同时变更'))
    .argument('[target]', localize('Exact package name or ./directory', '准确包名或 ./目录'))
    .option('--to <directory>', localize('Workspace-relative destination directory', '相对工作区根的目标目录'))
    .option('--name <package>', localize('New npm package name', '新 npm 包名'))
    .option('--dry-run', localize('Preview only (the default)', '仅预览（默认）'))
    .option('--apply <plan.json>', localize('Apply a reviewed saved plan', '应用已审查的计划'))
    .option('--json', localize('Output JSON', '输出 JSON'))
    .action(async (target: string | undefined, options: MoveCliOptions, command: Command) => {
      const inherited = command.optsWithGlobals<MoveCliOptions>()
      const json = options.json ?? inherited.json
      if (options.apply && (target !== undefined || options.to !== undefined || options.name !== undefined || options.dryRun || inherited.dryRun)) {
        throw new Error('--apply cannot be combined with target, --to, --name or --dry-run.')
      }
      if (options.apply) {
        const result = await applyWorkspaceMovePlan(cwd, JSON.parse(await readFile(path.resolve(cwd, options.apply), 'utf8')))
        process.stdout.write(`${json ? JSON.stringify(result, null, 2) : [result.status, ...result.changed, ...result.cleanupPending.map(file => `cleanup pending: ${file}`), ...result.nextSteps].join('\n')}\n`)
        return
      }
      if (!target) {
        throw new Error('Select one workspace or provide --apply <plan.json>.')
      }
      const plan = await planWorkspaceMove(cwd, { target, ...(options.to !== undefined ? { to: options.to } : {}), ...(options.name !== undefined ? { name: options.name } : {}) })
      process.stdout.write(`${json ? JSON.stringify(plan, null, 2) : formatPlan(plan)}\n`)
      if (!plan.canApply) {
        process.exitCode = 1
      }
    })
}
