import type { MonorepoConfig } from '../../../types'
import type { ConfigDiagnostic, Schema } from './schema'
import { admissionSchema } from './admission'
import { commandSchemas, dependencyTypes } from './commands'
import { installationSecuritySchema } from './installation-security'
import { array, boolean, choices, isRecord, names, nonempty, object, record, validateSchema } from './schema'
import { toolingSchema } from './tooling'

const selector = object({ packages: names, paths: names, tags: names, private: boolean })
const severity = choices('warn', 'fail')
const cycles = object({ dependencyTypes, severity })
const boundaries = object({
  tags: record(object({ packages: names, paths: names, private: boolean })),
  rules: array(object({ id: nonempty, from: selector, allow: array(selector), dependencyTypes, severity }, ['id', 'from', 'allow'])),
  cycles: { ...cycles, expected: 'false or cycle policy', accepts: value => value === false || cycles.accepts(value) },
  exceptions: array(object({ rule: nonempty, source: nonempty, target: nonempty, type: choices('dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'), reason: nonempty }, ['rule', 'source', 'target', 'type', 'reason'])),
})
const rootSchema = object({ commands: object(commandSchemas), tooling: toolingSchema, boundaries, dependencyPolicy: admissionSchema, installationSecurity: installationSecuritySchema, codeowners: object({ owners: record(names) }, ['owners']) } satisfies Record<keyof MonorepoConfig, Schema>)

export class ConfigValidationError extends Error {
  readonly code = 'REPOCTL_CONFIG_INVALID'
  constructor(readonly diagnostics: ConfigDiagnostic[]) {
    super(diagnostics.map(item => `${item.id}: ${item.path || '<root>'} (${item.actualType}); ${item.suggestion}`).join('\n'))
    this.name = 'ConfigValidationError'
  }
}

/** Validate owned fields only. C12 metadata and environment layers retain their native shape. */
export function validateMonorepoConfig(value: unknown): ConfigDiagnostic[] {
  const diagnostics: ConfigDiagnostic[] = []
  if (!isRecord(value)) {
    validateSchema(value === undefined ? null : value, rootSchema, '', diagnostics)
    return diagnostics
  }
  validateSchema(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'extends' && !key.startsWith('$') && key !== '_layers')), rootSchema, '', diagnostics)
  const upgrade = isRecord(value['commands']) && isRecord(value['commands']['upgrade']) ? value['commands']['upgrade'] : undefined
  if (upgrade?.['overwrite'] === true && (upgrade['noOverwrite'] === true || upgrade['skipOverwrite'] === true)) {
    diagnostics.push({ id: 'config.conflict', path: 'commands.upgrade.overwrite', actualType: 'boolean', expected: 'one overwrite policy', suggestion: 'Choose overwrite or noOverwrite/skipOverwrite, not both.' })
  }
  return diagnostics
}

export function assertMonorepoConfig(value: unknown) {
  const diagnostics = validateMonorepoConfig(value)
  if (diagnostics.length) {
    throw new ConfigValidationError(diagnostics)
  }
}

export type { ConfigDiagnostic } from './schema'
