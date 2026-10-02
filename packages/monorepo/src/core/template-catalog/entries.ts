import type { CreateTemplateDefinition, TemplateCatalogContext, TemplateCatalogDiagnostic, TemplateCatalogEntry } from './types'
import { isTemplateCategory, templateChoices } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { localize } from '../../i18n'
import { appendConfigPath } from '../config/paths'
import { presetTemplateDeclarations } from '../presets/templates'
import { normalizeTemplateRemoteSource, normalizeTemplateSourceRequest, sourceRequestKey, templateSourcePath } from '../template-source/request'

export function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function definition(value: unknown): CreateTemplateDefinition | undefined {
  const data = typeof value === 'string' ? { source: value, target: value } : record(value)
  if (!data || ['source', 'target'].some(key => typeof data[key] !== 'string' || !data[key].trim() || data[key].includes('\0'))) {
    return undefined
  }
  if (['label', 'description'].some(key => data[key] !== undefined && typeof data[key] !== 'string')) {
    return undefined
  }
  if (data['category'] !== undefined && (typeof data['category'] !== 'string' || !isTemplateCategory(data['category']))) {
    return undefined
  }
  let remote: CreateTemplateDefinition['remote']
  if (data['remote'] !== undefined) {
    try {
      remote = normalizeTemplateRemoteSource(data['remote'])
      templateSourcePath(data['source'] as string)
    }
    catch {
      return undefined
    }
  }
  return {
    source: data['source'] as string,
    target: data['target'] as string,
    ...(remote ? { remote } : {}),
    ...(typeof data['label'] === 'string' ? { label: data['label'] } : {}),
    ...(typeof data['description'] === 'string' ? { description: data['description'] } : {}),
    ...(typeof data['category'] === 'string' && isTemplateCategory(data['category']) ? { category: data['category'] } : {}),
  }
}

export function resolveCatalogEntries(context: TemplateCatalogContext, diagnostics: TemplateCatalogDiagnostic[]) {
  const { configFile, templatesDir, createConfig } = context
  const entries = new Map<string, TemplateCatalogEntry>(templateChoices.map(choice => [choice.key, {
    ...choice,
    sourceDir: path.resolve(templatesDir, choice.source),
    origin: 'builtin',
    overridesBuiltin: false,
    configFile: createConfig.templatesDir !== undefined ? configFile : null,
    ...(createConfig.templatesDir !== undefined ? { configPath: 'commands.create.templatesDir' } : {}),
  }]))
  if (createConfig.templatesDir !== undefined && (typeof createConfig.templatesDir !== 'string' || !createConfig.templatesDir.trim())) {
    diagnostics.push({ id: 'templates-directory', status: 'fail', configFile, configPath: 'commands.create.templatesDir', detail: localize('templatesDir must be a non-empty path.', 'templatesDir 必须是非空路径。') })
  }
  // C12 omits null properties during merging; preserve diagnostics for those declarations.
  for (const raw of context.rawCreateConfigs ?? []) {
    const paths = [
      ...['templatesDir', 'templateMap', 'choices'].filter(field => record(raw)?.[field] === null).map(field => `commands.create.${field}`),
      ...Object.entries(record(raw?.templateMap) ?? {}).filter(([, value]) => value === null).map(([key]) => appendConfigPath('commands.create.templateMap', key)),
    ]
    for (const configPath of paths) {
      if (!diagnostics.some(item => item.configPath === configPath)) {
        diagnostics.push({ id: 'template-definition', status: 'fail', configFile, configPath, detail: localize('Template configuration cannot be null.', '模板配置不能为 null。') })
      }
    }
  }
  const extra = record(createConfig.templateMap)
  if (createConfig.templateMap !== undefined && !extra) {
    diagnostics.push({ id: 'template-definition', status: 'fail', configFile, configPath: 'commands.create.templateMap', detail: localize('templateMap must be an object.', 'templateMap 必须是对象。') })
  }
  const declarations = [
    ...presetTemplateDeclarations(context.presetLayers ?? []),
    ...Object.entries(extra ?? {}).map(([key, value]) => ({ key, value, configFile, configPath: appendConfigPath('commands.create.templateMap', key), preset: undefined })),
  ]
  for (const { key, value, configFile, configPath, preset } of declarations) {
    const normalized = definition(value)
    if (!key.trim() || key !== key.trim() || !normalized) {
      entries.delete(key)
      diagnostics.push({ id: 'template-definition', status: 'fail', template: key, configFile, configPath, detail: localize('Invalid template key or definition; source and target must be non-empty paths and metadata must use supported values.', '模板 key 或定义无效；source 和 target 必须是非空路径，元数据必须使用受支持的值。') })
      continue
    }
    const previous = entries.get(key)
    const builtin = templateChoices.find(choice => choice.key === key)
    entries.set(key, {
      ...(builtin ?? { key, label: key }),
      ...normalized,
      sourceDir: normalized.remote ? `remote:${sourceRequestKey(normalizeTemplateSourceRequest(normalized.remote, normalized.source))}` : path.resolve(templatesDir, normalized.source),
      origin: 'custom',
      overridesBuiltin: Boolean(builtin),
      configFile,
      configPath,
      ...(preset ? { preset } : {}),
    })
    if (previous) {
      diagnostics.push({ id: 'template-override', status: 'warn', template: key, configFile, configPath, detail: localize(`${key} overrides ${previous.preset ? `${previous.preset.packageName}@${previous.preset.version}` : 'the built-in template'} (${previous.source}).`, `${key} 覆盖${previous.preset ? `${previous.preset.packageName}@${previous.preset.version}` : '内置模板'}（${previous.source}）。`) })
    }
  }
  return entries
}
