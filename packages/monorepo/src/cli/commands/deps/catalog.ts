import type { Command } from '@icebreakers/monorepo-templates'
import type { CatalogMigrationOptions, CatalogMigrationPlan } from '../../../types/catalogs'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { localize } from '../../../i18n'

const output = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)

export function registerCatalogCommands(deps: Command, cwd: string) {
  const catalog = deps.command('catalog').description(localize('Inspect pnpm catalogs and review coordinated migrations', '巡检 pnpm catalog 并审阅联动迁移'))
  catalog.command('check')
    .description(localize('Inspect references, usage and direct-version bypasses without writing', '只读巡检引用、使用情况和直接版本绕过'))
    .option('--catalog <name>', localize('Catalog policy for direct declarations and migration candidates', '直接声明与迁移候选所采用的 catalog 策略'), 'default')
    .option('--json', localize('Output a versioned catalog report', '输出有版本结构的 catalog 报告'))
    .action(async (options: { catalog: string, json?: boolean }) => {
      const { checkCatalogs } = await import('../../../commands/deps/catalog')
      const report = await checkCatalogs(cwd, options)
      if (options.json) {
        output(report)
      }
      else {
        for (const item of report.findings) {
          process.stdout.write(`[${item.code}] ${item.catalog}/${item.dependency}: ${item.path}${item.section ? ` / ${item.section}` : ''}\n`)
        }
        for (const candidate of report.candidates) {
          process.stdout.write(`[${candidate.status}:${candidate.reason}] ${candidate.dependency} / ${candidate.section} / ${candidate.group} -> ${candidate.catalog}\n`)
        }
      }
      if (report.summary.missing || report.summary.direct) {
        process.exitCode = 1
      }
    })
  catalog.command('plan')
    .description(localize('Preview catalog YAML and consumer manifest changes without writing', '只读预览 catalog YAML 与消费者清单的联动变更'))
    .argument('<dependency>', localize('Dependency to migrate', '待迁移依赖'))
    .requiredOption('--section <section>', localize('Dependency section; peer ranges remain unchanged', '依赖分区；peer 范围保留原样'))
    .option('--catalog <name>', localize('Default or named catalog', '默认或命名 catalog'), 'default')
    .option('--group <name>', localize('Configured dependency version group', '已配置的依赖版本组'), 'default')
    .option('--to <specifier>', localize('Explicit common subrange for non-equivalent declarations', '不等价声明的明确共同子范围'))
    .option('--dry-run', localize('Preview only (the default)', '仅预览（默认行为）'))
    .option('--json', localize('Output a reviewed plan for catalog apply', '输出可审阅并交给 catalog apply 的计划'))
    .action(async (dependency: string, options: Omit<CatalogMigrationOptions, 'dependency'> & { json?: boolean }) => {
      const { planCatalogMigration } = await import('../../../commands/deps/catalog')
      const plan = await planCatalogMigration(cwd, { dependency, ...options })
      if (options.json) {
        output(plan)
      }
      else {
        for (const file of plan.files) {
          process.stdout.write(`${file.path}\n--- before\n${file.before}\n+++ after\n${file.after}\n`)
        }
        process.stdout.write(localize('Preview only. Review --json output, then run deps catalog apply <plan.json>.\n', '仅预览。审阅 --json 输出后执行 deps catalog apply <plan.json>。\n'))
      }
    })
  catalog.command('apply')
    .description(localize('Apply a reviewed catalog migration with conflict checks and rollback', '应用已审阅的 catalog 迁移，检查冲突并支持失败恢复'))
    .argument('<plan>', localize('Reviewed JSON plan', '已审阅的 JSON 计划'))
    .option('--json', localize('Output the apply result as JSON', '以 JSON 输出应用结果'))
    .action(async (file: string, options: { json?: boolean }) => {
      const { applyCatalogMigrationPlan } = await import('../../../commands/deps/catalog')
      const result = await applyCatalogMigrationPlan(cwd, JSON.parse(await readFile(file, 'utf8')) as CatalogMigrationPlan)
      if (options.json) {
        output(result)
      }
      else {
        process.stdout.write(`${result.status}: ${result.changed.join(', ')}\n${result.nextSteps.join('\n')}\n`)
      }
    })
}
