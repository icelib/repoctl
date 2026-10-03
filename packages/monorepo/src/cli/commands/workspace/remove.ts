import type { Command } from '@icebreakers/monorepo-templates'
import type { WorkspaceRemovalPlan, WorkspaceRemovalResult } from '../../../types/removal'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { applyWorkspaceRemovalPlan } from '../../../commands/workspace/remove/apply'
import { planWorkspaceRemoval } from '../../../commands/workspace/remove/plan'
import { localize } from '../../../i18n'

interface RemovalCliOptions {
  json?: boolean
  dryRun?: boolean
  removeReferences?: boolean
  apply?: string
}

function formatPlan(plan: WorkspaceRemovalPlan) {
  return [
    localize(`Removal preview: ${plan.target.name ?? '(unnamed)'} (${plan.target.id})`, `移除预览：${plan.target.name ?? '（未命名）'}（${plan.target.id}）`),
    localize(`Directory entries: ${plan.inventory.length}; manifest changes: ${plan.files.length}`, `目录条目：${plan.inventory.length}；清单变更：${plan.files.length}`),
    ...plan.blockers.map(item => `blocked: ${item.code}: ${item.paths.join(', ')}`),
    ...plan.consumers.map(item => `consumer: ${item.path.join(' → ')}`),
    ...plan.files.flatMap(file => file.fields.map(field => `remove: ${file.path}: ${field}`)),
    ...plan.review.matches.map(item => `review: ${item.path}: ${item.values.join(', ')}`),
    localize('Review scans only Git-tracked text using literal matches; ignored/untracked, binary, large files and dynamic references are not analyzed.', '人工复核仅扫描 Git 跟踪文本的字面量；不分析忽略/未跟踪文件、二进制、大文件或动态引用。'),
    localize('Save the JSON preview outside the selected package, review it, then use workspace remove --apply <plan.json>.', '将 JSON 预览保存到所选包之外，审查后运行 workspace remove --apply <plan.json>。'),
    ...plan.nextSteps,
  ].join('\n')
}

function formatResult(result: WorkspaceRemovalResult) {
  return [
    `${result.status}: ${result.removed.join(', ')}`,
    ...result.changed.map(file => `changed: ${file}`),
    ...result.cleanupPending.map(file => `cleanup pending: ${file}`),
    ...result.nextSteps,
  ].join('\n')
}

export function registerWorkspaceRemoval(workspace: Command, cwd: string) {
  workspace.command('remove')
    .description(localize('Preview safe removal of one workspace; apply a reviewed saved plan explicitly', '预览安全移除单个工作区；显式应用已审查的计划'))
    .argument('[target]', localize('Exact package name or explicit ./directory', '准确包名或显式 ./目录'))
    .option('--remove-references', localize('Plan removal of exact dependency fields in consumer manifests', '计划删除消费者清单中的准确依赖字段'))
    .option('--dry-run', localize('Preview only (the default)', '仅预览（默认行为）'))
    .option('--apply <plan.json>', localize('Apply a reviewed JSON plan', '应用已审查的 JSON 计划'))
    .option('--json', localize('Output JSON', '输出 JSON'))
    .action(async (target: string | undefined, options: RemovalCliOptions) => {
      if (options.apply && (target !== undefined || options.removeReferences || options.dryRun)) {
        throw new Error(localize('--apply cannot be combined with a target, --remove-references or --dry-run.', '--apply 不能与目标、--remove-references 或 --dry-run 同时使用。'))
      }
      if (options.apply) {
        const plan = JSON.parse(await readFile(path.resolve(cwd, options.apply), 'utf8'))
        const result = await applyWorkspaceRemovalPlan(cwd, plan)
        process.stdout.write(`${options.json ? JSON.stringify(result, null, 2) : formatResult(result)}\n`)
        return
      }
      if (target === undefined) {
        throw new Error(localize('Select one workspace package or provide --apply <plan.json>.', '请选择单个工作区包或传入 --apply <plan.json>。'))
      }
      const plan = await planWorkspaceRemoval(cwd, { target, removeReferences: options.removeReferences === true })
      process.stdout.write(`${options.json ? JSON.stringify(plan, null, 2) : formatPlan(plan)}\n`)
      if (!plan.canApply) {
        process.exitCode = 1
      }
    })
}
