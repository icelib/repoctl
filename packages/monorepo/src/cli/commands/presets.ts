import type { Command } from 'commander'
import type { OrganizationPresetAssetPlan } from '../../core/presets'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import path from 'pathe'
import { loadMonorepoConfigDetails } from '../../core/config'
import { canonicalDirectory } from '../../core/file-transaction/paths'
import { applyOrganizationPresetAssets, planOrganizationPresetAssets } from '../../core/presets'
import { localize } from '../../i18n'

export function registerPresetCommands(program: Command, cwd: string) {
  const presets = program.command('presets').description(localize('Inspect installed organization presets and review engineering asset updates', '检查已安装的组织预设并审阅工程文件更新'))
  presets.command('inspect')
    .description(localize('Show installed package identities and recommendations without running package code', '只读查看预设包身份及推荐能力，不运行包代码'))
    .option('--json', localize('Output JSON', '输出 JSON'))
    .action(async (options: { json?: boolean }) => {
      const loaded = await loadMonorepoConfigDetails(await findWorkspaceDir(cwd) ?? cwd, { refresh: true })
      const report = {
        schemaVersion: 1,
        workspaceDir: loaded.presets.workspaceDir,
        diagnostics: loaded.presets.diagnostics,
        presets: loaded.presets.layers.map(layer => ({
          ...layer.source,
          requires: layer.manifest.requires,
          templates: Object.keys(layer.manifest.templates ?? {}),
          capabilities: layer.manifest.capabilities ?? [],
          assets: layer.manifest.assets ?? [],
        })),
      }
      process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : report.presets.map(item => `${item.id}: ${item.templates.length} templates, ${item.assets.length} assets; recommendations: ${item.capabilities.map(capability => capability.id).join(', ') || '-'}`).join('\n') || 'No organization presets configured.'}\n`)
    })
  presets.command('plan')
    .description(localize('Plan managed engineering assets without writing project files', '只读规划预设工程文件'))
    .option('--json', localize('Output the complete JSON plan', '输出完整 JSON 计划'))
    .option('--out <file>', localize('Save the JSON plan to a new file', '将 JSON 计划保存到新文件'))
    .action(async (options: { json?: boolean, out?: string }) => {
      const plan = await planOrganizationPresetAssets(cwd)
      if (options.out) {
        await writeFile(path.resolve(cwd, options.out), `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' })
      }
      process.stdout.write(`${options.json ? JSON.stringify(plan, null, 2) : [plan.status, ...plan.files.map(file => `${file.status}: ${file.path} (${file.source.packageName}@${file.source.version})`), ...plan.conflicts.map(item => `${item.path}: ${item.reason}`)].join('\n')}\n`)
      if (plan.status === 'blocked') {
        process.exitCode = 1
      }
    })
  presets.command('apply <file>')
    .description(localize('Apply an unchanged reviewed JSON asset plan', '应用经审阅且输入未变化的 JSON 工程文件计划'))
    .option('--json', localize('Output JSON', '输出 JSON'))
    .action(async (file: string, options: { json?: boolean }) => {
      const plan = JSON.parse(await readFile(path.resolve(cwd, file), 'utf8')) as OrganizationPresetAssetPlan
      if (plan.rootDir !== await canonicalDirectory(await findWorkspaceDir(cwd) ?? cwd)) {
        throw new Error('Preset plan must belong to the current workspace')
      }
      const result = await applyOrganizationPresetAssets(plan)
      process.stdout.write(`${options.json ? JSON.stringify(result, null, 2) : `${result.status}: ${result.changed.length} files`}\n`)
    })
}
