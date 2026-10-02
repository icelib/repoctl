import type { WorkspaceBoundariesConfig, WorkspaceBoundarySelector } from './types'

export const dependencyTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export class BoundaryConfigError extends Error {
  constructor(public field: string, detail: string) {
    super(detail)
  }
}

function requireValue(value: unknown, field: string, message: string): asserts value {
  if (!value) {
    throw new BoundaryConfigError(field, message)
  }
}

function fields(value: unknown, allowed: string[], field: string): asserts value is Record<string, unknown> {
  requireValue(record(value), field, 'Expected a configuration object.')
  for (const key of Object.keys(value)) {
    requireValue(allowed.includes(key), `${field}.${key}`, 'Unknown configuration field.')
  }
}

export function validPath(value: string) {
  return value === '.' || (!/[\\:*?[\]{}!]/u.test(value) && !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..'))
}

function selector(value: unknown, field: string, tags: string[], allowTags = true): asserts value is WorkspaceBoundarySelector {
  fields(value, allowTags ? ['packages', 'paths', 'tags', 'private'] : ['packages', 'paths', 'private'], field)
  requireValue(Object.values(value).some(item => item !== undefined), field, 'An empty selector is ambiguous; select paths, packages, tags or private explicitly.')
  for (const key of ['packages', 'paths', 'tags']) {
    if (value[key] === undefined) {
      continue
    }
    const values = value[key]
    requireValue(Array.isArray(values) && values.length && values.every(text), `${field}.${key}`, 'Expected a nonempty string array.')
    for (const item of values) {
      if (key === 'paths') {
        const base = item.endsWith('/**') ? item.slice(0, -3) : item
        requireValue(validPath(base), `${field}.paths`, 'Use an exact relative directory, or directory/**; other glob syntax is unsupported.')
      }
      if (key === 'tags') {
        requireValue(tags.includes(item), `${field}.tags`, `Unknown tag: ${item}`)
      }
    }
  }
  requireValue(value['private'] === undefined || typeof value['private'] === 'boolean', `${field}.private`, 'Expected a boolean.')
}

function policy(value: Record<string, unknown>, field: string) {
  requireValue(value['severity'] === undefined || ['warn', 'fail'].includes(value['severity'] as string), `${field}.severity`, 'Severity must be warn or fail.')
  requireValue(value['dependencyTypes'] === undefined || (Array.isArray(value['dependencyTypes'])
    && value['dependencyTypes'].length && value['dependencyTypes'].every(type => dependencyTypes.includes(type))), `${field}.dependencyTypes`, 'Select at least one supported manifest dependency field.')
}

/** Runtime validation is shared by CLI, doctor and API. No rules silently disappear. */
export function parseBoundariesConfig(value: unknown): WorkspaceBoundariesConfig {
  fields(value, ['tags', 'rules', 'cycles', 'exceptions'], 'boundaries')
  requireValue(value['tags'] === undefined || record(value['tags']), 'boundaries.tags', 'Expected a tag-to-selector object.')
  const tags = Object.keys(value['tags'] ?? {})
  for (const [name, definition] of Object.entries(value['tags'] ?? {})) {
    requireValue(text(name), 'boundaries.tags', 'Tag names must be nonempty.')
    selector(definition, `boundaries.tags.${name}`, [], false)
  }
  requireValue(value['rules'] === undefined || Array.isArray(value['rules']), 'boundaries.rules', 'Expected an array of rules.')
  const ids = new Set(['cycle'])
  for (const [index, rule] of (value['rules'] as unknown[] ?? []).entries()) {
    const field = `boundaries.rules[${index}]`
    fields(rule, ['id', 'from', 'allow', 'severity', 'dependencyTypes'], field)
    requireValue(text(rule['id']) && !ids.has(rule['id']), `${field}.id`, 'Rule IDs must be nonempty and unique; cycle is reserved.')
    ids.add(rule['id'])
    selector(rule['from'], `${field}.from`, tags)
    requireValue(Array.isArray(rule['allow']), `${field}.allow`, 'Expected selector alternatives; [] explicitly denies all internal edges.')
    rule['allow'].forEach((item, i) => selector(item, `${field}.allow[${i}]`, tags))
    policy(rule, field)
  }
  if (value['cycles'] !== undefined && value['cycles'] !== false) {
    fields(value['cycles'], ['severity', 'dependencyTypes'], 'boundaries.cycles')
    policy(value['cycles'], 'boundaries.cycles')
  }
  requireValue(value['exceptions'] === undefined || Array.isArray(value['exceptions']), 'boundaries.exceptions', 'Expected an exception array.')
  const exceptions = new Set<string>()
  for (const [index, exception] of (value['exceptions'] as unknown[] ?? []).entries()) {
    const field = `boundaries.exceptions[${index}]`
    fields(exception, ['rule', 'source', 'target', 'type', 'reason'], field)
    requireValue(text(exception['rule']) && ids.has(exception['rule']), `${field}.rule`, 'Exception must reference a configured rule or cycle.')
    for (const key of ['source', 'target']) {
      requireValue(text(exception[key]) && validPath(exception[key]), `${field}.${key}`, 'Expected an exact workspace-relative directory.')
    }
    requireValue(dependencyTypes.includes(exception['type'] as typeof dependencyTypes[number]), `${field}.type`, 'Expected a supported manifest dependency field.')
    requireValue(text(exception['reason']), `${field}.reason`, 'Every exception requires a reason.')
    const key = JSON.stringify([exception['rule'], exception['source'], exception['target'], exception['type']])
    requireValue(!exceptions.has(key), field, 'Duplicate exception.')
    exceptions.add(key)
  }
  return value as WorkspaceBoundariesConfig
}
