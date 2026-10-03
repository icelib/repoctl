import type { TemplateParameterDefinition, TemplateParameterSchema, TemplateParameterValue } from './types'

export const parameterName = /^[a-z]\w*$/u
export const isParameterRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))
export function parameterError(path: string, reason: string): never {
  // User values are deliberately absent, including malformed secrets.
  throw new Error(`Template parameter ${path}: ${reason}`)
}
export function parameterValueMatches(definition: TemplateParameterDefinition, value: unknown): value is TemplateParameterValue {
  return definition.type === 'boolean'
    ? typeof value === 'boolean'
    : typeof value === 'string' && value.length <= 65536 && (definition.type !== 'enum' || definition.options.includes(value))
}

export function validateTemplateParameterSchema(value: unknown): asserts value is TemplateParameterSchema {
  if (!isParameterRecord(value) || Object.keys(value).length > 64) {
    parameterError('parameters', 'expected an object containing at most 64 definitions')
  }
  for (const [name, item] of Object.entries(value)) {
    const field = `parameters.${name}`
    if (!parameterName.test(name) || ['constructor', 'prototype', '__proto__'].includes(name)) {
      parameterError(field, 'use a portable parameter name')
    }
    if (!isParameterRecord(item) || !['string', 'boolean', 'enum'].includes(String(item['type']))) {
      parameterError(field, 'expected a string, boolean or enum definition')
    }
    const allowed = ['type', 'description', 'required', 'sensitive', 'default', ...(item['type'] === 'enum' ? ['options'] : [])]
    if (Object.keys(item).some(key => !allowed.includes(key))) {
      parameterError(field, 'unsupported definition field')
    }
    if ((item['description'] !== undefined && typeof item['description'] !== 'string')
      || (item['required'] !== undefined && typeof item['required'] !== 'boolean')
      || (item['sensitive'] !== undefined && typeof item['sensitive'] !== 'boolean')) {
      parameterError(field, 'invalid description, required or sensitive declaration')
    }
    if (item['sensitive'] === true && (item['type'] !== 'string' || Object.hasOwn(item, 'default'))) {
      parameterError(field, 'sensitive inputs must be strings without stored defaults')
    }
    if (item['type'] === 'enum' && (!Array.isArray(item['options']) || !item['options'].length || item['options'].length > 100
      || item['options'].some(option => typeof option !== 'string' || !option.length || option.length > 1024)
      || new Set(item['options']).size !== item['options'].length)) {
      parameterError(field, 'enum options must be unique nonempty strings')
    }
    if (Object.hasOwn(item, 'default') && !parameterValueMatches(item as unknown as TemplateParameterDefinition, item['default'])) {
      parameterError(`${field}.default`, 'default does not satisfy its declared type')
    }
  }
}
