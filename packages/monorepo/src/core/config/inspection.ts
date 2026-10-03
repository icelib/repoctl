import type { ConfigValueSource } from '../../types/presets'
import type { ConfigCommand, ResolvedCommandConfig } from './resolution'
import type { ConfigDiagnostic } from './validation'
import { loadMonorepoConfigDetails } from '../config'
import { commandConfigDirectory } from './context'
import { resolveCommandValues } from './resolution'
import { ConfigValidationError } from './validation'

export type ConfigReportValue = null | boolean | number | string | ConfigReportValue[] | { [key: string]: ConfigReportValue }
export interface ConfigValidationReport {
  schemaVersion: 1
  valid: boolean
  file: string | null
  diagnostics: ConfigDiagnostic[]
}
export interface ConfigExplanation extends ConfigValidationReport {
  cwd: string
  config: ConfigReportValue
  sources?: Record<string, ConfigValueSource>
  layers?: Array<{ source: ConfigValueSource, config: ConfigReportValue }>
  effective?: { command: ConfigCommand, values: ConfigReportValue, origins: ResolvedCommandConfig['origins'], sources: ResolvedCommandConfig['sources'] }
}

const privatePaths = new Set(['commands.mirror.env', 'commands.upgrade.scripts', 'tooling.commitlint', 'tooling.eslint', 'tooling.stylelint', 'tooling.lintStaged.config', 'tooling.lintStaged.repoCommand', 'tooling.vitest.overrides', 'tooling.tsconfig.compilerOptions', 'tooling.husky'])
const sensitiveKey = /token|secret|password|credential|authorization|cookie|api[_-]?key|private[_-]?key/i

/** Deliberately opaque native tool payloads can contain plugins, functions, cycles and credentials. */
export function sanitizeConfigReport(value: unknown, field = '', seen = new Set<object>()): ConfigReportValue {
  const key = field.split('.').at(-1) ?? ''
  if (privatePaths.has(field) || sensitiveKey.test(key) || key.startsWith('$')) {
    return '[redacted]'
  }
  if (value === null || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '[number]'
  }
  if (typeof value === 'string') {
    return /[a-z]+:\/\/[^\s/][^\s/:]*:[^\s/]+@|(?:token|password|secret|authorization)\s*[:=]/i.test(value) ? '[redacted]' : value
  }
  if (typeof value === 'undefined') {
    return null
  }
  if (typeof value !== 'object') {
    return `[${typeof value}]`
  }
  if (value instanceof RegExp) {
    return '[RegExp]'
  }
  if (seen.has(value)) {
    return '[circular]'
  }
  const next = new Set(seen).add(value)
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeConfigReport(item, `${field}.${index}`, next))
  }
  return Object.fromEntries(Object.keys(value).map((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name)!
    return [name, 'value' in descriptor ? sanitizeConfigReport(descriptor.value, field ? `${field}.${name}` : name, next) : '[accessor]']
  }))
}

export async function explainMonorepoConfig(cwd: string, options: { command?: ConfigCommand, overrides?: Record<string, unknown> } = {}): Promise<ConfigExplanation> {
  try {
    const loaded = await loadMonorepoConfigDetails(options.command ? await commandConfigDirectory(options.command, cwd) : cwd, { refresh: true })
    const effective = options.command ? resolveCommandValues(options.command, loaded.config.commands?.[options.command], options.overrides, { entry: 'cli', layers: loaded.sourceLayers }) : undefined
    if (!options.command && Object.keys(options.overrides ?? {}).length) {
      throw new ConfigValidationError([{ id: 'config.invalid-value', path: 'command', actualType: 'undefined', expected: 'command context', suggestion: 'Provide a command context before supplying overrides.' }])
    }
    return {
      schemaVersion: 1,
      valid: true,
      cwd,
      file: loaded.file,
      diagnostics: [],
      config: sanitizeConfigReport(loaded.config),
      sources: loaded.sources,
      layers: loaded.sourceLayers.map(layer => ({ source: layer.source, config: sanitizeConfigReport(layer.config) })),
      ...(effective ? { effective: { ...effective, values: sanitizeConfigReport(effective.values, `commands.${effective.command}`) } } : {}),
    }
  }
  catch (error) {
    if (!(error instanceof ConfigValidationError)) {
      throw error
    }
    return { schemaVersion: 1, valid: false, cwd, file: null, config: {}, diagnostics: error.diagnostics }
  }
}

export async function validateConfigFile(cwd: string): Promise<ConfigValidationReport> {
  const { schemaVersion, valid, file, diagnostics } = await explainMonorepoConfig(cwd)
  return { schemaVersion, valid, file, diagnostics }
}
