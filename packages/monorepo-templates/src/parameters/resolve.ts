import type { ResolvedTemplateParameters, TemplateParameterSchema, TemplateParameterValue } from './types'
import { isParameterRecord, parameterError, parameterValueMatches, validateTemplateParameterSchema } from './schema'

/** The same strict, synchronous resolver serves prompts, JSON input and local generators. */
export function resolveTemplateParameters(schema: TemplateParameterSchema, input: unknown = {}): ResolvedTemplateParameters {
  validateTemplateParameterSchema(schema)
  if (!isParameterRecord(input)) {
    parameterError('values', 'expected an object')
  }
  for (const name of Object.keys(input)) {
    if (!Object.hasOwn(schema, name)) {
      parameterError(`values.${name}`, 'unknown parameter')
    }
  }
  const result: ResolvedTemplateParameters = { values: {}, report: {}, retained: {}, sensitive: [] }
  for (const [name, definition] of Object.entries(schema)) {
    const value = Object.hasOwn(input, name) ? input[name] : definition.default
    if (value === undefined) {
      if (definition.required) {
        parameterError(`values.${name}`, 'required parameter is missing')
      }
      continue
    }
    if (!parameterValueMatches(definition, value) || (definition.required && value === '')) {
      parameterError(`values.${name}`, `expected ${definition.type}${definition.type === 'enum' ? ' option' : ''}`)
    }
    result.values[name] = value
    result.report[name] = definition.sensitive ? '[redacted]' : value
    if (definition.sensitive) {
      result.sensitive.push(name)
    }
    else {
      result.retained[name] = value
    }
  }
  return result
}

export interface TemplateParameterPrompt {
  (name: string, definition: TemplateParameterSchema[string]): Promise<TemplateParameterValue | undefined>
}

/** Prompts only omitted inputs; supplied inputs are validated before any question is asked. */
export async function promptTemplateParameters(schema: TemplateParameterSchema, input: unknown, prompt: TemplateParameterPrompt) {
  validateTemplateParameterSchema(schema)
  const optional = Object.fromEntries(Object.entries(schema).map(([name, definition]) => [name, { ...definition, required: false }]))
  resolveTemplateParameters(optional, input)
  const values = { ...(input as Record<string, unknown>) }
  for (const [name, definition] of Object.entries(schema)) {
    if (!Object.hasOwn(values, name)) {
      const value = await prompt(name, definition)
      if (value !== undefined) {
        values[name] = value
      }
    }
  }
  return resolveTemplateParameters(schema, values)
}
