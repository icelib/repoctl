import type { Command } from '@icebreakers/monorepo-templates'
import type { DependencyFixPlan, DependencySection } from '../../types/dependencies'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { localize } from '../../i18n'
import { registerDependencyAdmission } from './deps/admission'
import { registerCatalogCommands } from './deps/catalog'
import { registerPeerChecks } from './deps/peers'

function output(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

export function registerDepsCommands(program: Command, cwd: string) {
  const deps = program.command('deps').description(localize('Inspect dependency declarations and review explicit fixes', '检查依赖声明并审阅显式修复'))
  registerPeerChecks(deps, cwd)
  registerDependencyAdmission(deps, cwd)
  registerCatalogCommands(deps, cwd)
  deps.command('check')
    .description(localize('Check dependency consistency without writing or accessing registries', '只读检查依赖版本一致性，不访问 registry'))
    .option('--json', localize('Output the dependency report as JSON', '以 JSON 输出依赖报告'))
    .action(async (options: { json?: boolean }) => {
      const { checkDependencies } = await import('../../commands/deps')
      const report = await checkDependencies(cwd)
      if (options.json) {
        output(report)
      }
      else {
        for (const group of report.groups) {
          process.stdout.write(`[${group.status}] ${group.dependency} / ${group.section} / ${group.group}\n  ${group.detail}${group.reason ? ` (${group.reason})` : ''}\n`)
          for (const item of group.occurrences) {
            process.stdout.write(`  ${item.path}: ${item.specifier} [${item.protocol}]${item.range ? ` -> ${item.source}@${item.range}` : ''}\n`)
          }
        }
      }
      if (report.summary.equivalent + report.summary.compatible + report.summary.conflict > 0) {
        process.exitCode = 1
      }
    })
  deps.command('plan')
    .alias('fix')
    .description(localize('Preview an explicit dependency fix; always read-only', '预览显式依赖修复；始终只读'))
    .argument('<dependency>', localize('Dependency name', '依赖名称'))
    .requiredOption('--section <section>', localize('dependencies, devDependencies, peerDependencies or optionalDependencies', '依赖分区：dependencies、devDependencies、peerDependencies 或 optionalDependencies'))
    .requiredOption('--to <specifier>', localize('Explicit target semver range or same-source npm alias', '明确的目标 semver 范围或同源 npm alias'))
    .option('--group <name>', localize('Configured version group', '配置中的版本分组'), 'default')
    .option('--dry-run', localize('Preview only (already the default)', '仅预览（默认行为）'))
    .option('--json', localize('Output a serializable plan for deps apply', '输出可交给 deps apply 的 JSON 计划'))
    .action(async (dependency: string, options: { section: DependencySection, to: string, group: string, json?: boolean }) => {
      const { planDependencyFix } = await import('../../commands/deps')
      const plan = await planDependencyFix(cwd, { dependency, section: options.section, to: options.to, group: options.group })
      if (options.json) {
        output(plan)
        return
      }
      for (const file of plan.files) {
        process.stdout.write(`${file.path} / ${file.section}.${file.dependency}: ${file.before} -> ${file.after}\n`)
      }
      process.stdout.write(localize('Preview only. Save --json output, review it, then run deps apply <plan.json>.\n', '仅预览。保存并审阅 --json 输出，然后执行 deps apply <plan.json>。\n'))
    })
  deps.command('apply')
    .description(localize('Apply a reviewed dependency plan with conflict checks and rollback', '应用已审阅的依赖计划，检查冲突并支持失败回滚'))
    .argument('<plan>', localize('JSON plan file', 'JSON 计划文件'))
    .option('--json', localize('Output the result as JSON', '以 JSON 输出结果'))
    .action(async (file: string, options: { json?: boolean }) => {
      const { applyDependencyFixPlan } = await import('../../commands/deps')
      const result = await applyDependencyFixPlan(cwd, JSON.parse(await readFile(file, 'utf8')) as DependencyFixPlan)
      if (options.json) {
        output(result)
      }
      else {
        process.stdout.write(`${result.status}: ${result.changed.join(', ')}\n`)
        process.stdout.write(localize(`Next, explicitly run:\n${result.nextSteps.join('\n')}\n`, `下一步请手动执行：\n${result.nextSteps.join('\n')}\n`))
      }
    })
}
