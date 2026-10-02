import type { DependencyAdmissionConfig } from './types'
import { loadMonorepoConfigDetails } from '../../../core/config'
import { dependencySections } from '../policy'

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(text)

function requireValue(value: unknown, field: string, message: string): asserts value {
  if (!value) {
    throw new Error(`dependencyPolicy.${field}: ${message}`)
  }
}

function fields(value: unknown, keys: string[], field: string): asserts value is Record<string, unknown> {
  requireValue(object(value), field, 'Expected an object.')
  requireValue(Object.keys(value).every(key => keys.includes(key)), field, 'Unknown configuration field.')
}

export function validWorkspaceSelector(value: string) {
  if (value === '*' || value === '.') {
    return true
  }
  const base = value.endsWith('/**') ? value.slice(0, -3) : value
  return !/[\\:*?[\]{}!]/u.test(base) && !base.startsWith('/') && base.split('/').every(part => part && part !== '.' && part !== '..')
}

function dependencyPattern(value: string) {
  return /^(?:@[^\s/@*]+\/(?:[^\s/@*]+|\*)|[^\s/@*]+)$/u.test(value)
}

export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

export function parseAdmissionConfig(input: unknown): DependencyAdmissionConfig {
  fields(input, ['rules', 'exceptions'], '')
  requireValue(Array.isArray(input['rules']), 'rules', 'Expected explicit allow/deny rules.')
  const ids = new Set<string>()
  for (const [index, rule] of input['rules'].entries()) {
    const field = `rules[${index}]`
    fields(rule, ['id', 'workspaces', 'dependencies', 'effect', 'sections', 'reason', 'alternative', 'severity'], field)
    requireValue(text(rule['id']) && /^[\w.-]+$/u.test(rule['id']) && !ids.has(rule['id']), `${field}.id`, 'Expected a unique ASCII rule ID using letters, numbers, dots, underscores or hyphens.')
    ids.add(rule['id'])
    requireValue(strings(rule['workspaces']) && rule['workspaces'].every(validWorkspaceSelector), `${field}.workspaces`, 'Use exact names/paths, directory/** or *.')
    requireValue(strings(rule['dependencies']) && rule['dependencies'].every(dependencyPattern), `${field}.dependencies`, 'Use exact dependency names or @scope/*.')
    requireValue(['allow', 'deny'].includes(rule['effect'] as string), `${field}.effect`, 'Expected allow or deny.')
    requireValue(strings(rule['sections']) && rule['sections'].every(section => dependencySections.includes(section as typeof dependencySections[number])), `${field}.sections`, 'Explicitly select supported dependency fields.')
    requireValue(text(rule['reason']), `${field}.reason`, 'A rule requires a reason.')
    requireValue(rule['alternative'] === undefined || text(rule['alternative']), `${field}.alternative`, 'Expected a nonempty suggestion.')
    requireValue(rule['severity'] === undefined || ['warn', 'fail'].includes(rule['severity'] as string), `${field}.severity`, 'Expected warn or fail.')
  }
  requireValue(input['exceptions'] === undefined || Array.isArray(input['exceptions']), 'exceptions', 'Expected an exception array.')
  const exceptions = new Set<string>()
  for (const [index, exception] of (input['exceptions'] as unknown[] ?? []).entries()) {
    const field = `exceptions[${index}]`
    fields(exception, ['rule', 'workspace', 'dependency', 'section', 'reason', 'expiresOn'], field)
    requireValue(text(exception['rule']) && ids.has(exception['rule']), `${field}.rule`, 'Expected a configured rule ID.')
    requireValue(text(exception['workspace']) && !exception['workspace'].includes('*') && validWorkspaceSelector(exception['workspace']), `${field}.workspace`, 'Use an exact workspace-relative directory.')
    requireValue(text(exception['dependency']) && dependencyPattern(exception['dependency']) && !exception['dependency'].includes('*'), `${field}.dependency`, 'Use an exact manifest dependency key.')
    requireValue(dependencySections.includes(exception['section'] as typeof dependencySections[number]), `${field}.section`, 'Expected a dependency field.')
    requireValue(text(exception['reason']), `${field}.reason`, 'An exception requires a reason.')
    requireValue(exception['expiresOn'] === undefined || validDate(exception['expiresOn']), `${field}.expiresOn`, 'Expected a valid YYYY-MM-DD date.')
    const key = JSON.stringify([exception['rule'], exception['workspace'], exception['dependency'], exception['section']])
    requireValue(!exceptions.has(key), field, 'Duplicate exception.')
    exceptions.add(key)
  }
  return input as unknown as DependencyAdmissionConfig
}

function rejectNull(value: unknown) {
  requireValue(value !== null, '', 'Null is not a policy value; omit optional fields instead.')
  if (object(value) || Array.isArray(value)) {
    Object.values(value).forEach(rejectNull)
  }
}

export async function loadAdmissionConfig(cwd: string) {
  const loaded = await loadMonorepoConfigDetails(cwd, { refresh: true })
  for (const layer of loaded.rawLayers) {
    rejectNull(layer.dependencyPolicy)
  }
  return { configured: loaded.config.dependencyPolicy !== undefined, config: parseAdmissionConfig(loaded.config.dependencyPolicy === undefined ? { rules: [] } : loaded.config.dependencyPolicy) }
}
