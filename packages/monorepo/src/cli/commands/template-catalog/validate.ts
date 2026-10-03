import type { Command, TemplateParameterValues } from '@icebreakers/monorepo-templates'
import type { TemplateValidationOptions } from '../../../commands/template-validation'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { planTemplateValidation, validateTemplate } from '../../../commands/template-validation'
import { localize } from '../../../i18n'

interface Options {
  offline?: boolean
  cacheDir?: string
  name?: string[]
  parameterMatrix?: string
  fixture?: string
  timeout?: string
  keepFailed?: boolean
  keepTemp?: boolean
  dryRun?: boolean
  json?: boolean
  out?: string
}

async function readParameterMatrix(filename: string): Promise<TemplateParameterValues[]> {
  const content = await readFile(path.resolve(filename))
  if (content.length > 1024 * 1024) {
    throw new Error('Template parameter matrix exceeds 1 MiB.')
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content))
  }
  catch {
    throw new Error('Template parameter matrix must contain valid UTF-8 JSON.')
  }
  if (!Array.isArray(value)) {
    throw new TypeError('Template parameter matrix must be an array of parameter objects.')
  }
  return value as TemplateParameterValues[]
}

export function registerTemplateValidation(templates: Command) {
  templates.command('validate')
    .description(localize('Generate, install and validate an isolated template sample', '生成、安装并验证隔离的模板样本'))
    .argument('<key>')
    .option('--offline', localize('Use only verified cached remote assets', '只使用通过校验的远程资产缓存'))
    .option('--cache-dir <directory>', localize('Template asset cache directory', '模板资产缓存目录'))
    .option('--name <name>', localize('Sample name; repeat for a matrix', '样本名称，可重复用于组合验证'), (name: string, previous: string[] = []) => [...previous, name])
    .option('--parameter-matrix <file>', localize('JSON array of typed parameter objects, crossed with names', '类型化参数对象的 JSON 数组文件，与样本名称交叉验证'))
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
          ...(opts.offline !== undefined ? { offline: opts.offline } : {}),
          ...(opts.cacheDir ? { cacheDir: opts.cacheDir } : {}),
          ...(opts.name ? { names: opts.name } : {}),
          ...(opts.parameterMatrix ? { parameterSets: await readParameterMatrix(opts.parameterMatrix) } : {}),
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
            process.stdout.write(`${sample.name} [parameters ${sample.parameterSet + 1}]: ${sample.status}${sample.failedStage ? ` (${sample.failedStage})` : ''}\n`)
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
