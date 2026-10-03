import type { ConfigDiagnostic } from './schema'
import { normalizeTemplateSourceRequest } from '../../template-source/request'
import { appendConfigPath } from '../paths'
import { isRecord } from './schema'

export function validateTemplateSources(config: Record<string, unknown>, diagnostics: ConfigDiagnostic[]) {
  const commands = config['commands']
  const create = isRecord(commands) && isRecord(commands['create']) ? commands['create'] : undefined
  const templates = create?.['templateMap']
  if (!isRecord(templates)) {
    return
  }
  for (const [key, definition] of Object.entries(templates)) {
    if (!isRecord(definition) || definition['remote'] === undefined || typeof definition['source'] !== 'string') {
      continue
    }
    const path = `${appendConfigPath('commands.create.templateMap', key)}.remote`
    if (diagnostics.some(diagnostic => diagnostic.path === path || diagnostic.path.startsWith(`${path}.`))) {
      continue
    }
    try {
      normalizeTemplateSourceRequest(definition['remote'], definition['source'])
    }
    catch (error) {
      diagnostics.push({ id: 'config.invalid-value', path, actualType: 'object', expected: 'fixed npm or Git template source without credentials', suggestion: error instanceof Error ? error.message : 'Use a fixed npm or Git template source.' })
    }
  }
}
