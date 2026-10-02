import { appendConfigPath } from '../paths'

export interface ConfigDiagnostic {
  id: 'config.unknown-field' | 'config.invalid-type' | 'config.invalid-value' | 'config.conflict' | 'config.load-failed'
  path: string
  actualType: string
  expected: string
  suggestion: string
}

export interface Schema {
  expected: string
  accepts: (value: unknown) => boolean
  fields?: Record<string, Schema>
  items?: Schema
  values?: Schema
  required?: string[]
  alternatives?: Schema[]
}

export const string: Schema = { expected: 'string', accepts: value => typeof value === 'string' }
export const nonempty: Schema = { expected: 'nonempty string', accepts: value => typeof value === 'string' && value.trim().length > 0 }
export const boolean: Schema = { expected: 'boolean', accepts: value => typeof value === 'boolean' }
export const positive: Schema = { expected: 'positive finite number', accepts: value => typeof value === 'number' && Number.isFinite(value) && value > 0 }
export const opaque: Schema = { expected: 'native tool configuration', accepts: () => true }
export const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))
export const object = (fields: Record<string, Schema>, required?: string[]): Schema => ({ expected: 'object', accepts: isRecord, fields, ...(required ? { required } : {}) })
export const array = (items: Schema): Schema => ({ expected: `array of ${items.expected}`, accepts: Array.isArray, items })
export const record = (values: Schema): Schema => ({ expected: 'object map', accepts: isRecord, values })
export const choices = (...values: Array<string | boolean>): Schema => ({ expected: values.map(String).join(' | '), accepts: value => values.includes(value as string) })
export const union = (...schemas: Schema[]): Schema => ({ expected: schemas.map(schema => schema.expected).join(' | '), accepts: value => schemas.some(schema => schema.accepts(value)), alternatives: schemas })
export const strings = array(string)
export const names = array(nonempty)

export function actualType(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  return typeof value
}

export function validateSchema(value: unknown, schema: Schema, path: string, diagnostics: ConfigDiagnostic[], ancestors = new Set<object>()) {
  if (value === undefined) {
    return
  }
  if (!schema.accepts(value)) {
    diagnostics.push({ id: 'config.invalid-type', path, actualType: actualType(value), expected: schema.expected, suggestion: `Use ${schema.expected}; omit an optional field instead of using null.` })
    return
  }
  if (schema.alternatives) {
    validateSchema(value, schema.alternatives.find(item => item.accepts(value))!, path, diagnostics, ancestors)
    return
  }
  if (!schema.fields && !schema.items && !schema.values) {
    return
  }
  if (ancestors.has(value as object)) {
    diagnostics.push({ id: 'config.invalid-value', path, actualType: 'object', expected: 'acyclic configuration', suggestion: 'Remove the circular reference from repoctl-owned fields.' })
    return
  }
  const parents = new Set(ancestors).add(value as object)
  if (schema.items && Array.isArray(value)) {
    value.forEach((item, index) => validateSchema(item, schema.items!, `${path}[${index}]`, diagnostics, parents))
  }
  if (!isRecord(value)) {
    return
  }
  for (const key of schema.required ?? []) {
    if (value[key] === undefined) {
      diagnostics.push({ id: 'config.invalid-value', path: appendConfigPath(path, key), actualType: 'undefined', expected: schema.fields![key]!.expected, suggestion: 'Provide this required field.' })
    }
  }
  for (const [key, item] of Object.entries(value)) {
    const childPath = appendConfigPath(path, key)
    const child = schema.fields && Object.hasOwn(schema.fields, key) ? schema.fields[key] : schema.values
    if (child) {
      validateSchema(item, child, childPath, diagnostics, parents)
    }
    else {
      diagnostics.push({ id: 'config.unknown-field', path: childPath, actualType: actualType(item), expected: `one of: ${Object.keys(schema.fields ?? {}).join(', ')}`, suggestion: 'Correct the field name or move native options into the documented tool passthrough.' })
    }
  }
}
