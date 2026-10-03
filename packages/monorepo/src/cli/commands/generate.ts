import type { Command } from '@icebreakers/monorepo-templates'
import type { GeneratorName } from '../../commands/generate/types'
import process from 'node:process'
import { localize } from '../../i18n'

interface Options {
  package: string
  directory?: string
  barrel?: string
  export?: boolean
  params?: string
  json?: boolean
  dryRun?: boolean
}

export function registerGenerateCommand(program: Command, cwd: string) {
  program.command('generate')
    .alias('g')
    .description(localize('Generate a component or route inside an existing package', '在已有包内生成组件或路由'))
    .argument('<generator>', 'vue-component, react-component, hono-route')
    .argument('<name>', localize('Kebab-case component or route name', 'kebab-case 组件或路由名称'))
    .requiredOption('--package <name-or-path>', localize('Exact workspace package name or relative directory', '精确 workspace 包名或相对目录'))
    .option('--directory <path>', localize('Package-relative source directory', '包内源文件相对目录'))
    .option('--barrel <path>', localize('TypeScript export barrel, used with --export', '配合 --export 使用的 TypeScript 导出文件'))
    .option('--export', localize('Add a named export to src/index.ts or --barrel', '向 src/index.ts 或 --barrel 添加具名导出'))
    .option('--params <json>', localize('Additional typed generator parameters as JSON', 'JSON 格式的类型化生成参数'))
    .option('--dry-run', localize('Preview all generated changes without writing', '预览全部生成变更，不写入文件'))
    .option('--json', localize('Print a JSON preview without writing', '以 JSON 输出预览，不写入文件'))
    .action(async (generator: GeneratorName, name: string, options: Options) => {
      try {
        const { applyGeneratePlan, planGenerate } = await import('../../commands/generate')
        const extra: unknown = options.params ? JSON.parse(options.params) : {}
        if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
          throw new Error('--params must contain a JSON object.')
        }
        if (Object.hasOwn(extra, 'name') || (options.export !== undefined && Object.hasOwn(extra, 'export'))) {
          throw new Error('Do not supply the same generator parameter through multiple inputs.')
        }
        const plan = await planGenerate({
          cwd,
          package: options.package,
          generator,
          parameters: { ...extra, name, ...(options.export === undefined ? {} : { export: options.export }) },
          ...(options.directory === undefined ? {} : { directory: options.directory }),
          ...(options.barrel === undefined ? {} : { barrel: options.barrel }),
        })
        if (options.json || options.dryRun) {
          process.stdout.write(`${options.json ? JSON.stringify(plan, null, 2) : plan.files.map(file => `${file.action}: ${file.path}`).concat(plan.nextSteps).join('\n')}\n`)
          return
        }
        const result = await applyGeneratePlan(plan)
        process.stdout.write(`${result.changed.map(file => `generated: ${file}`).concat(result.nextSteps).join('\n')}\n`)
        if (result.recoveryFiles.length) {
          process.stderr.write(`Recovery files retained: ${result.recoveryFiles.join(', ')}\n`)
          process.exitCode = 1
        }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        process.stderr.write(`${options.json ? JSON.stringify({ error: message }) : message}\n`)
        process.exitCode = 1
      }
    })
}
