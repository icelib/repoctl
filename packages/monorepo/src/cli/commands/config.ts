import type { Command } from '@icebreakers/monorepo-templates'
import type { ConfigInspection } from '../../commands/config'
import type { ConfigExplanation } from '../../core/config/inspection'
import type { ConfigCommand } from '../../core/config/resolution'
import os from 'node:os'
import process from 'node:process'
import path from 'pathe'
import { explainMonorepoConfig, sanitizeConfigReport, validateConfigFile } from '../../core/config/inspection'
import { ConfigValidationError } from '../../core/config/validation'
import { logger } from '../../core/logger'
import { localize } from '../../i18n'
import fs from '../../utils/fs'
import { formatConfigExplanation, parseConfigOverrides } from './config-explanation'

interface ConfigInspectCliOptions {
  json?: boolean
  markdown?: boolean
  out?: string
  redact?: boolean
  command?: ConfigCommand
  set?: string[]
}

function formatConfigInspection(inspection: ConfigInspection) {
  const commandKeys = Object.keys(inspection.config.commands ?? {})
  const toolingKeys = Object.keys(inspection.config.tooling ?? {})
  return [
    localize(`cwd: ${inspection.cwd}`, `当前目录：${inspection.cwd}`),
    localize(`file: ${inspection.file ?? '-'}`, `文件：${inspection.file ?? '-'}`),
    localize(`commands: ${commandKeys.length > 0 ? commandKeys.join(', ') : '-'}`, `命令：${commandKeys.length > 0 ? commandKeys.join(', ') : '-'}`),
    localize(`tooling: ${toolingKeys.length > 0 ? toolingKeys.join(', ') : '-'}`, `Tooling：${toolingKeys.length > 0 ? toolingKeys.join(', ') : '-'}`),
  ].join('\n')
}

function formatMarkdownTable(rows: Array<[string, string | number | undefined]>) {
  const formatCell = (value: string | number | undefined) => String(value ?? '-')
    .split('|')
    .join('\\|')
    .split('\n')
    .join('<br>')

  return [
    localize('| Field | Value |', '| 字段 | 值 |'),
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${label} | ${formatCell(value)} |`),
  ].join('\n')
}

function formatConfigInspectionMarkdown(inspection: ConfigInspection) {
  const commandKeys = Object.keys(inspection.config.commands ?? {})
  const toolingKeys = Object.keys(inspection.config.tooling ?? {})

  return [
    localize('# Repo config inspection', '# Repo 配置检查'),
    '',
    formatMarkdownTable([
      ['cwd', inspection.cwd],
      ['file', inspection.file ?? '-'],
      ['commands', commandKeys.length],
      ['tooling', toolingKeys.length],
    ]),
    '',
    localize('## Commands', '## 命令'),
    '',
    ...(commandKeys.length > 0 ? commandKeys.map(key => `- ${key}`) : ['- -']),
    '',
    localize('## Tooling', '## Tooling 配置'),
    '',
    ...(toolingKeys.length > 0 ? toolingKeys.map(key => `- ${key}`) : ['- -']),
  ].join('\n')
}

function replaceAll(value: string, search: string, replacement: string) {
  return search.length > 0 ? value.split(search).join(replacement) : value
}

function redactConfigInspectionValue(value: unknown, replacements: Array<[string, string]>): unknown {
  if (typeof value === 'string') {
    return replacements.reduce((result, [search, replacement]) => replaceAll(result, search, replacement), value)
  }
  if (Array.isArray(value)) {
    return value.map(item => redactConfigInspectionValue(item, replacements))
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactConfigInspectionValue(item, replacements)]),
    )
  }
  return value
}

function redactConfigInspection(inspection: ConfigInspection): ConfigInspection {
  const candidates: Array<[string, string]> = [
    [inspection.cwd, '<cwd>'],
    [inspection.file ? path.dirname(inspection.file) : '', '<configDir>'],
    [os.homedir(), '<home>'],
  ]
  const replacements = candidates
    .filter(([search], index, entries) => search.length > 0 && entries.findIndex(([value]) => value === search) === index)
    .sort(([left], [right]) => right.length - left.length)

  return redactConfigInspectionValue(inspection, replacements) as ConfigInspection
}

async function emitConfigInspection(inspection: ConfigInspection, opts: ConfigInspectCliOptions, cwd: string, explanation?: ConfigExplanation) {
  const safe = { ...inspection, ...explanation, config: sanitizeConfigReport(inspection.config) } as ConfigInspection
  const outputInspection = opts.redact ? redactConfigInspection(safe) : safe
  const detail = explanation ? formatConfigExplanation(opts.redact ? redactConfigInspection(explanation as unknown as ConfigInspection) as unknown as ConfigExplanation : explanation) : ''
  const content = opts.json
    ? JSON.stringify(outputInspection, null, 2)
    : opts.markdown
      ? `${formatConfigInspectionMarkdown(outputInspection)}${detail ? `\n\n${detail}` : ''}`
      : `${formatConfigInspection(outputInspection)}${detail ? `\n${detail}` : ''}`

  if (!opts.out) {
    process.stdout.write(`${content}\n`)
    return
  }

  const outFile = path.resolve(cwd, opts.out)
  await fs.outputFile(outFile, `${content}\n`, 'utf8')
  logger.success(localize(`Wrote ${path.relative(cwd, outFile)}`, `已写入 ${path.relative(cwd, outFile)}`))
}

export function registerConfigCommands(program: Command, cwd: string) {
  const configCommand = program.command('config').alias('cfg').description(localize('Configuration commands', '配置命令'))

  configCommand.command('inspect')
    .description(localize('Show the active repoctl config file and resolved configuration', '输出当前 repoctl 配置文件和已解析配置'))
    .alias('i')
    .option('--json', localize('Output JSON for scripts', '输出 JSON，方便脚本消费'))
    .option('--markdown', localize('Output Markdown', '输出 Markdown，方便粘贴到 issue 或 PR'))
    .option('--out <file>', localize('Write output to a file', '把当前输出写入文件'))
    .option('--redact', localize('Redact cwd, configDir, and home paths', '脱敏 cwd/configDir/home 绝对路径后再输出'))
    .option('--command <context>', localize('Explain effective ai/clean/create/deps/init/mirror/release/upgrade values', '解释 ai/clean/create/deps/init/mirror/release/upgrade 的最终配置'))
    .option('--set <field=JSON>', localize('Preview a config override; repeatable', '预览配置覆盖，可重复使用'), (value: string, previous: string[]) => [...previous, value], [])
    .action(async (opts: ConfigInspectCliOptions) => {
      try {
        if (opts.command || opts.set?.length) {
          const report = await explainMonorepoConfig(cwd, { ...(opts.command ? { command: opts.command } : {}), overrides: parseConfigOverrides(opts.set) })
          if (!report.valid) {
            throw new ConfigValidationError(report.diagnostics)
          }
          await emitConfigInspection(report as unknown as ConfigInspection, opts, cwd, report)
        }
        else {
          const { inspectMonorepoConfig } = await import('@/commands')
          await emitConfigInspection(await inspectMonorepoConfig(cwd), opts, cwd)
        }
      }
      catch (error) {
        if (!(error instanceof ConfigValidationError)) {
          throw error
        }
        if (opts.json) {
          process.stdout.write(`${JSON.stringify({ schemaVersion: 1, valid: false, diagnostics: error.diagnostics }, null, 2)}\n`)
        }
        else {
          process.stdout.write(`${error.message}\n`)
        }
        process.exitCode = 1
      }
    })

  configCommand.command('validate')
    .description(localize('Validate owned config fields without running commands', '只读校验 repoctl 自有配置字段'))
    .option('--json', localize('Output JSON for scripts', '输出 JSON，方便脚本消费'))
    .action(async (opts: { json?: boolean }) => {
      const report = await validateConfigFile(cwd)
      if (opts.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      }
      else {
        process.stdout.write(`${report.valid ? 'Configuration is valid.' : new ConfigValidationError(report.diagnostics).message}\n`)
      }
      if (!report.valid) {
        process.exitCode = 1
      }
    })
}
