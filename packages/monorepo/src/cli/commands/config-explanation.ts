import type { ConfigExplanation } from '../../core/config/inspection'
import { splitConfigPath } from '../../core/config/paths'
import { ConfigValidationError } from '../../core/config/validation'

export function parseConfigOverrides(inputs: string[] = []): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const input of inputs) {
    const split = input.indexOf('=')
    const parts = input.slice(0, split).split('.')
    if (split < 1 || parts.some(part => !/^[\w-]+$/.test(part) || ['__proto__', 'constructor', 'prototype'].includes(part))) {
      throw invalidOverride()
    }
    let value: unknown
    try {
      value = JSON.parse(input.slice(split + 1))
    }
    catch { throw invalidOverride() }
    let current = result
    for (const part of parts.slice(0, -1)) {
      if (current[part] !== undefined && (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part]))) {
        throw invalidOverride()
      }
      current[part] ??= {}
      current = current[part] as Record<string, unknown>
    }
    current[parts.at(-1)!] = value
  }
  return result
}

function invalidOverride() {
  return new ConfigValidationError([{ id: 'config.invalid-value', path: 'overrides', actualType: 'string', expected: 'field=JSON', suggestion: 'Use a command field path followed by = and a JSON value; quote it for your shell.' }])
}

export function formatConfigExplanation(report: ConfigExplanation): string {
  if (!report.valid) {
    return report.diagnostics.map(item => `${item.id}: ${item.path || '<root>'} (${item.actualType}); ${item.suggestion}`).join('\n')
  }
  if (!report.effective) {
    return ''
  }
  const { command, values, origins } = report.effective
  return [`context: ${command}`, ...Object.entries(origins).map(([field, source]) => {
    let value = values
    for (const part of splitConfigPath(field)) {
      if (value === '[redacted]') {
        break
      }
      value = value && typeof value === 'object' && !Array.isArray(value) ? value[part]! : null
    }
    const identity = report.effective?.sources[field]
    return `${field}: ${JSON.stringify(value)} (${identity?.kind === 'preset' ? `${identity.packageName}@${identity.version}` : source})`
  })].join('\n')
}
