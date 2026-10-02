import type { Command } from '@icebreakers/monorepo-templates'
import type { TemplateValidationOptions } from '../../../commands/template-validation'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { planTemplateValidation, validateTemplate } from '../../../commands/template-validation'
import { localize } from '../../../i18n'

interface Options {
  name?: string[]
  fixture?: string
  timeout?: string
  keepFailed?: boolean
  keepTemp?: boolean
  dryRun?: boolean
  json?: boolean
  out?: string
}

export function registerTemplateValidation(templates: Command) {
  templates.command('validate')
    .description(localize('Generate, install and validate an isolated template sample', '生成、安装并验证隔离的模板样本'))
    .argument('<key>')
    .option('--name <name>', localize('Sample name; repeat for a matrix', '样本名称，可重复用于组合验证'), (name: string, previous: string[] = []) => [...previous, name])
    .option('--fixture <directory>', localize('Author workspace fixture to copy', '需要复制的作者工作区样本'))
    .option('--timeout <ms>', localize('Timeout per child command', '每个子命令超时毫秒数'))
    .option('--keep-failed', localize('Keep failing samples and diagnostics', '保留失败样本和诊断'))
    .option('--keep-temp', localize('Keep every generated sample', '保留全部生成样本'))
    .option('--dry-run', localize('Inspect the plan without generation or commands', '只检查计划，不生成或执行命令'))
    .option('--json', localize('Print machine-readable JSON', '输出 JSON'))
    .option('--out <file>', localize('Write the report to a file', '报告写入文件'))
    .action(async (key: string, _localOptions: Options, command: Command) => {
      const opts = command.optsWithGlobals() as Options
      const controller = new AbortController()
      const interrupt = () => controller.abort('SIGINT')
      const terminate = () => controller.abort('SIGTERM')
      process.on('SIGINT', interrupt)
      process.on('SIGTERM', terminate)
      try {
        const options: TemplateValidationOptions = {
          template: key,
          cwd: process.cwd(),
          signal: controller.signal,
          ...(opts.name ? { names: opts.name } : {}),
          ...(opts.fixture ? { fixtureDir: opts.fixture } : {}),
          ...(opts.timeout ? { timeoutMs: Number(opts.timeout) } : {}),
          keep: opts.keepTemp ? 'always' : opts.keepFailed ? 'failure' : 'never',
        }
        const result = opts.dryRun ? await planTemplateValidation(options) : await validateTemplate(options)
        const json = JSON.stringify(result, null, 2)
        if (opts.out) {
          await writeFile(path.resolve(opts.out), `${json}\n`)
        }
        if (opts.json) {
          process.stdout.write(`${json}\n`)
        }
        else if ('status' in result) {
          process.stdout.write(`Template ${key}: ${result.status}\n`)
          for (const diagnostic of result.plan.diagnostics) {
            process.stdout.write(`[${diagnostic.code}] ${diagnostic.message}\n`)
          }
          for (const sample of result.samples) {
            process.stdout.write(`${sample.name}: ${sample.status}${sample.failedStage ? ` (${sample.failedStage})` : ''}\n`)
            for (const step of sample.steps.filter(step => step.status !== 'passed')) {
              process.stdout.write(`${step.command?.output ?? step.diagnostics.map(item => `[${item.code}] ${item.message}`).join('\n')}\n`)
            }
          }
          if (result.retained) {
            process.stdout.write(`Retained: ${result.temporaryDirectory}\n`)
          }
        }
        else {
          process.stdout.write(`${json}\n`)
        }
        process.exitCode = controller.signal.aborted ? controller.signal.reason === 'SIGTERM' ? 143 : 130 : ('status' in result ? result.status !== 'passed' : result.diagnostics.length > 0) ? 1 : 0
      }
      finally {
        process.removeListener('SIGINT', interrupt)
        process.removeListener('SIGTERM', terminate)
      }
    })
}
