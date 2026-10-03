import type { Command } from '@icebreakers/monorepo-templates'
import type { DevContainerPlan } from '../../../types/devcontainer'
import { readFile, stat, writeFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { localize } from '../../../i18n'

interface Options {
  nodeVersion?: string
  apply?: string
  json?: boolean
  out?: string
  dryRun?: boolean
}

export function registerDevContainerCommand(command: Command, cwd: string) {
  command.command('devcontainer')
    .description(localize('Preview a pnpm Dev Container preset, or apply a reviewed plan', '预览 pnpm Dev Container 预设，或应用已审查的计划'))
    .option('--node-version <version>', localize('Choose an exact Node version allowed by engines.node', '选择 engines.node 允许的精确 Node 版本'))
    .option('--apply <plan>', localize('Apply a saved JSON plan without starting containers', '应用已保存的 JSON 计划，不启动容器'))
    .option('--dry-run', localize('Preview only (the default)', '只读预览（默认行为）'))
    .option('--json', localize('Output JSON with generated files and diffs', '输出包含生成文件与差异的 JSON'))
    .option('--out <file>', localize('Save the JSON preview to a new file', '将 JSON 预览保存到一个新文件'))
    .action(async (_options: Options, current: Command) => {
      const options = current.optsWithGlobals<Options>()
      const { applyDevContainerPlan, planDevContainer } = await import('@/commands')
      if (options.apply) {
        if (options.nodeVersion || options.dryRun || options.out) {
          throw new Error('--apply cannot be combined with preview or selection options.')
        }
        const filename = path.resolve(cwd, options.apply)
        if ((await stat(filename)).size > 1024 * 1024) {
          throw new Error('Dev Container plan exceeds 1 MiB.')
        }
        const plan = JSON.parse(await readFile(filename, 'utf8')) as DevContainerPlan
        const result = await applyDevContainerPlan(cwd, plan)
        process.stdout.write(`${options.json ? JSON.stringify(result, null, 2) : `${result.status}: ${result.files.join(', ') || result.workspaceDir}`}\n`)
        return
      }
      const plan = await planDevContainer(cwd, options.nodeVersion ? { nodeVersion: options.nodeVersion } : {})
      const json = `${JSON.stringify(plan, null, 2)}\n`
      if (options.out) {
        const filename = path.resolve(cwd, options.out)
        const relative = path.relative(plan.workspaceDir, filename)
        if (relative === '.devcontainer.json' || relative === '.devcontainer' || relative.startsWith('.devcontainer/')) {
          throw new Error('Save the reviewed plan outside the Dev Container target paths.')
        }
        await writeFile(filename, json, { flag: 'wx' })
      }
      process.stdout.write(`${options.json
        ? json.trimEnd()
        : [
            `${plan.status}: ${plan.image} / ${plan.packageManager}`,
            ...plan.files.map(file => `${file.action}: ${file.path}`),
            ...plan.blockers,
            ...plan.files.filter(file => file.action === 'preserve' && file.diff).map(file => file.diff),
            localize('Review the JSON plan, then use --apply <plan>. Start the container explicitly in your editor or Dev Containers CLI.', '审查 JSON 计划后使用 --apply <plan>；通过编辑器或 Dev Containers CLI 主动启动容器。'),
          ].join('\n')}\n`)
      if (plan.status === 'blocked') {
        process.exitCode = 1
      }
    })
}
