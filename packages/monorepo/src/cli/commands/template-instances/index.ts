import type { Command } from '@icebreakers/monorepo-templates'
import type { TemplateLinkOptions } from '../../../commands/template-instances'
import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import path from 'pathe'
import { localize } from '../../../i18n'
import fs from '../../../utils/fs'

interface OutputOptions { json?: boolean, out?: string }
interface LinkOptions extends OutputOptions {
  template: string
  sourceVersion: string
  sourceDir?: string
  profile?: string
  packageName?: string
  renameJson?: boolean
  unverified?: boolean
  apply?: boolean
}

async function root() {
  return await findWorkspaceDir(process.cwd()) ?? process.cwd()
}

async function output(value: unknown, options: OutputOptions) {
  const content = JSON.stringify(value, null, 2)
  if (options.out) {
    await fs.outputFile(path.resolve(options.out), `${content}\n`)
  }
  else {
    process.stdout.write(`${content}\n`)
  }
}

export function registerTemplateInstanceCommands(templates: Command) {
  templates.command('instances')
    .description(localize('Inspect registered template instances without changing files', '只读查询已登记模板实例'))
    .argument('[target]', localize('Instance ID or workspace-relative target', '实例 ID 或相对工作区路径'))
    .option('--json', localize('Output structured JSON', '输出结构化 JSON'))
    .option('--out <file>', localize('Write the report to a file', '将报告写入文件'))
    .action(async (target: string | undefined, options: OutputOptions, command: Command) => {
      const { listTemplateInstances } = await import('../../../commands/template-instances')
      const instances = await listTemplateInstances(await root())
      const selected = target ? instances.filter(item => item.instance.id === target || item.instance.target === target) : instances
      if (target && !selected.length) {
        throw new Error(`Unknown template instance: ${target}`)
      }
      await output({ schemaVersion: 1, instances: selected }, { ...command.optsWithGlobals(), ...options })
    })

  templates.command('link')
    .description(localize('Preview an explicit historical template association; --apply writes metadata only', '预览历史模板关联；--apply 仅写登记信息'))
    .argument('<target>', localize('Existing workspace-relative project path', '存量项目相对工作区路径'))
    .requiredOption('--template <key>', localize('Stable template key', '稳定模板标识'))
    .requiredOption('--source-version <version>', localize('Exact historical template package version', '模板包的精确历史版本'))
    .option('--source-dir <directory>', localize('Read an extracted historical template package without executing it', '只读使用已解压的历史模板包，不执行其脚本'))
    .option('--profile <profile>', localize('workspace-copy-v1 or repo-new-v1', 'workspace-copy-v1 或 repo-new-v1'), 'repo-new-v1')
    .option('--package-name <name>', localize('Historical generated package name', '历史生成包名'))
    .option('--rename-json', localize('Historical output used package.mock.json', '历史生成时使用了 package.mock.json'))
    .option('--unverified', localize('Explicitly allow metadata-only association when the source is unavailable', '来源不可用时显式允许未验证关联'))
    .option('--apply', localize('Apply the reviewed association without changing project files', '应用关联，不改写项目文件'))
    .option('--json', localize('Output the plan as JSON', '以 JSON 输出计划'))
    .option('--out <file>', localize('Write the plan or result to a file', '将计划或结果写入文件'))
    .action(async (target: string, options: LinkOptions, command: Command) => {
      const { applyTemplateLinkPlan, planTemplateLink } = await import('../../../commands/template-instances')
      const input: TemplateLinkOptions = {
        cwd: await root(),
        target,
        template: options.template,
        version: options.sourceVersion,
        profile: (options.profile ?? 'repo-new-v1') as NonNullable<TemplateLinkOptions['profile']>,
        parameters: { ...(options.packageName ? { packageName: options.packageName } : {}), ...(options.renameJson !== undefined ? { renameJson: options.renameJson } : {}) },
        allowUnverified: options.unverified === true,
        ...(options.sourceDir ? { sourceDir: options.sourceDir } : {}),
      }
      const plan = await planTemplateLink(input)
      await output(options.apply ? await applyTemplateLinkPlan(plan) : plan, { ...command.optsWithGlobals(), ...options })
    })

  templates.command('relocate')
    .description(localize('Associate a missing instance with an identical destination, without moving files', '显式关联已移动且可验证的实例，不移动业务文件'))
    .argument('<instance>', localize('Registered instance ID or old path', '已登记实例 ID 或旧路径'))
    .argument('<target>', localize('New workspace-relative path', '新相对工作区路径'))
    .option('--apply', localize('Update the registered path', '更新登记路径'))
    .option('--json', localize('Output JSON', '输出 JSON'))
    .option('--out <file>', localize('Write the report to a file', '将报告写入文件'))
    .action(async (instance: string, target: string, options: OutputOptions & { apply?: boolean }, command: Command) => {
      const { relocateTemplateInstance } = await import('../../../commands/template-instances')
      await output(await relocateTemplateInstance(await root(), instance, target, options.apply), { ...command.optsWithGlobals(), ...options })
    })

  templates.command('rebuild-baseline')
    .description(localize('Reconstruct a retained baseline into a new isolated directory', '在新的隔离目录中重建留存基线'))
    .argument('<instance>', localize('Instance ID or target', '实例 ID 或目标路径'))
    .requiredOption('--destination <directory>', localize('A directory that does not exist', '尚不存在的目录'))
    .option('--original', localize('Reconstruct the original template before repoctl transformations', '重建 repoctl 处理前的原始模板'))
    .action(async (instance: string, options: { destination: string, original?: boolean }) => {
      const { rebuildTemplateInstanceBaseline } = await import('../../../commands/template-instances')
      const result = await rebuildTemplateInstanceBaseline(await root(), instance, path.resolve(options.destination), options.original ? 'original' : 'rendered')
      await output({ instance: result.id, destination: path.resolve(options.destination) }, {})
    })
}
