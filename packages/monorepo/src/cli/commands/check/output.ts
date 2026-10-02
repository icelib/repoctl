import type { RecommendedCheckPlan } from '../../../commands/check'
import type { AffectedCheckPlan } from '../../../commands/check/affected'
import os from 'node:os'
import { localize } from '../../../i18n'
import { formatAffectedCheckPlan } from './affected'

type CheckPlan = RecommendedCheckPlan | AffectedCheckPlan

interface CheckOutputOptions {
  json?: boolean
  markdown?: boolean
  redact?: boolean
}

function formatCheckPlan(plan: RecommendedCheckPlan) {
  const lines = [
    localize(`cwd: ${plan.cwd}`, `当前目录：${plan.cwd}`),
    localize(`mode: ${plan.mode}`, `模式：${plan.mode}`),
    '',
  ]

  for (const command of plan.commands) {
    lines.push(`- ${command.command}`)
    lines.push(`  ${command.description}`)
  }

  return lines.join('\n')
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

function formatCheckPlanMarkdown(plan: RecommendedCheckPlan) {
  return [
    localize('# Repo check plan', '# Repo 检查计划'),
    '',
    formatMarkdownTable([
      ['cwd', plan.cwd],
      ['mode', plan.mode],
      ['commands', plan.commands.length],
    ]),
    '',
    localize('## Commands', '## 命令'),
    '',
    ...plan.commands.map(command => `- \`${command.command}\` - ${command.description}`),
  ].join('\n')
}

function replaceAll(value: string, search: string, replacement: string) {
  return search.length > 0 ? value.split(search).join(replacement) : value
}

function redactCheckPlanValue(value: unknown, replacements: Array<[string, string]>): unknown {
  if (typeof value === 'string') {
    return replacements.reduce((result, [search, replacement]) => replaceAll(result, search, replacement), value)
  }
  if (Array.isArray(value)) {
    return value.map(item => redactCheckPlanValue(item, replacements))
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactCheckPlanValue(item, replacements)]),
    )
  }
  return value
}

function redactCheckPlan(plan: CheckPlan): CheckPlan {
  const candidates: Array<[string, string]> = [
    [plan.cwd, '<cwd>'],
    [os.homedir(), '<home>'],
  ]
  const replacements = candidates
    .filter(([search], index, entries) => search.length > 0 && entries.findIndex(([value]) => value === search) === index)
    .sort(([left], [right]) => right.length - left.length)

  return redactCheckPlanValue(plan, replacements) as CheckPlan
}

export function createCheckPlanOutput(plan: CheckPlan, opts: CheckOutputOptions) {
  const outputPlan = opts.redact ? redactCheckPlan(plan) : plan
  if (opts.json) {
    return JSON.stringify(outputPlan, null, 2)
  }
  if (outputPlan.mode === 'affected') {
    return formatAffectedCheckPlan(outputPlan, opts.markdown)
  }
  if (opts.markdown) {
    return formatCheckPlanMarkdown(outputPlan)
  }
  return formatCheckPlan(outputPlan)
}
