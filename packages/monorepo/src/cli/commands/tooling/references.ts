import type { Command } from '@icebreakers/monorepo-templates'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { applyProjectReferencesPlan, checkProjectReferences, planProjectReferences, syncProjectReferences } from '../../../commands/project-references'
import { localize } from '../../../i18n'

function output(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

export function registerProjectReferencesCommands(tooling: Command, cwd: string) {
  const command = tooling.command('references').description(localize('Inspect and synchronize TypeScript project references', '检查和同步 TypeScript project references'))
  command.command('check').option('--json', localize('Output stable JSON (default)', '输出稳定 JSON（默认）')).description(localize('Check existing or explicitly managed references without writing', '只读检查已有或显式受管的引用')).action(async () => {
    const result = await checkProjectReferences(cwd)
    output(result)
    if (!result.ok) {
      process.exitCode = 1
    }
  })
  command.command('plan').option('--json', localize('Output stable JSON (default)', '输出稳定 JSON（默认）')).description(localize('Preview a serializable references plan', '预览可保存的引用计划')).action(async () => output(await planProjectReferences(cwd)))
  command.command('sync').option('--dry-run', localize('Preview without writing', '预览但不写入')).description(localize('Synchronize explicitly enabled references', '同步显式启用的引用')).action(async (options: { dryRun?: boolean }) => output(options.dryRun ? await planProjectReferences(cwd) : await syncProjectReferences(cwd)))
  command.command('apply <plan>').description(localize('Apply a reviewed JSON plan', '应用已审阅的 JSON 计划')).action(async (file: string) => output(await applyProjectReferencesPlan(JSON.parse(await readFile(file, 'utf8')))))
}
