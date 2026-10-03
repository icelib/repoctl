import type { CreateChoiceOption } from '../../types'
import type { TemplateCatalogContext, TemplateCatalogDiagnostic, TemplateCatalogEntry } from './types'
import { localize } from '../../i18n'
import { record } from './entries'

export function resolveCatalogChoices(context: TemplateCatalogContext, entries: Map<string, TemplateCatalogEntry>, diagnostics: TemplateCatalogDiagnostic[]): CreateChoiceOption[] {
  const { choices } = context.createConfig
  const selected = new Set<string>()
  if (choices !== undefined && !Array.isArray(choices)) {
    diagnostics.push({ id: 'template-choice', status: 'fail', configFile: context.configFile, configPath: 'commands.create.choices', detail: localize('choices must be an array.', 'choices 必须是数组。') })
  }
  for (const [index, raw] of (Array.isArray(choices) ? choices : []).entries()) {
    const choice = record(raw)
    const key = choice?.['value']
    const configPath = `commands.create.choices[${index}]`
    if (!choice || typeof key !== 'string' || !entries.has(key) || selected.has(key)
      || ['name', 'description', 'short'].some(field => choice[field] !== undefined && typeof choice[field] !== 'string')
      || (choice['disabled'] !== undefined && typeof choice['disabled'] !== 'boolean' && typeof choice['disabled'] !== 'string')) {
      diagnostics.push({ id: 'template-choice', status: 'fail', configFile: context.configFile, configPath, ...(typeof key === 'string' ? { template: key } : {}), detail: localize('Invalid, duplicate or unknown template choice.', '模板交互选项无效、重复或引用了未知模板。') })
      continue
    }
    selected.add(key)
    const entry = entries.get(key)!
    if (typeof choice['name'] === 'string') {
      entry.label = choice['name']
    }
    if (typeof choice['description'] === 'string') {
      entry.description = choice['description']
    }
    if (typeof choice['short'] === 'string') {
      entry.short = choice['short']
    }
    if (choice['disabled'] !== undefined) {
      entry.disabled = choice['disabled'] as boolean | string
    }
  }
  const available = Array.isArray(choices) && choices.length ? [...selected].map(key => entries.get(key)!) : [...entries.values()]
  return available.map(entry => ({
    value: entry.key,
    name: entry.label,
    ...(entry.description !== undefined ? { description: entry.description } : {}),
    ...(entry.short !== undefined ? { short: entry.short } : {}),
    ...(entry.disabled !== undefined ? { disabled: entry.disabled } : {}),
  }))
}
