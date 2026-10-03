import type { MonorepoConfig } from '../../types'
import { chinaMirrorsEnvs } from '../../commands/mirror/sources'
import { appendConfigPath } from './paths'
import { assertMonorepoConfig, ConfigValidationError } from './validation'
import { commandSchemas } from './validation/commands'
import { isRecord, validateSchema } from './validation/schema'

export type ConfigCommand = keyof NonNullable<MonorepoConfig['commands']>
export type CommandConfig<Name extends ConfigCommand> = NonNullable<NonNullable<MonorepoConfig['commands']>[Name]>
export type CommandConfigOverrides<Name extends ConfigCommand> = { [Key in keyof CommandConfig<Name>]?: CommandConfig<Name>[Key] | undefined }
export type ConfigOrigin = 'default' | 'project' | 'cli'
export interface ResolvedCommandConfig<Name extends ConfigCommand = ConfigCommand> {
  command: Name
  values: CommandConfig<Name>
  /** Dot paths relative to the command block; arrays are replaced as a whole. */
  origins: Record<string, ConfigOrigin>
}

const defaults = {
  ai: { baseDir: 'agentic/prompts', force: false, format: 'md' },
  clean: { autoConfirm: false, dryRun: false, ignorePackages: [], includePrivate: true },
  create: { renameJson: false, defaultTemplate: 'tsdown' },
  deps: { groups: [] },
  doctor: {},
  env: { tasks: ['build'], frameworkInference: true },
  init: { skipReadme: false, skipPkgJson: false, skipChangeset: false, skipIssueTemplateConfig: false, tooling: [], force: false },
  mirror: { env: chinaMirrorsEnvs },
  release: { qualityScripts: ['build', 'lint', 'test'], hooks: { verify: [], beforeVersion: [], afterVersion: [], beforePublish: [], afterPublish: [] } },
  upgrade: { interactive: false, core: false, outDir: '', skipOverwrite: false, yes: false, overwrite: false, noOverwrite: false, overwriteRelease: false, mergeTargets: true, scripts: {}, skipChangesetMarkdown: true },
} satisfies { [Name in ConfigCommand]: CommandConfig<Name> }

/** Shared by inspection and execution. Undefined never masks a project/default value. */
export function resolveCommandValues<Name extends ConfigCommand>(name: Name, project: CommandConfig<Name> = {} as CommandConfig<Name>, overrides: CommandConfigOverrides<Name> = {}, options: { entry?: 'api' | 'cli' } = {}): ResolvedCommandConfig<Name> {
  const schema = Object.hasOwn(commandSchemas, name) ? commandSchemas[name] : undefined
  if (!schema) {
    throw new ConfigValidationError([{ id: 'config.invalid-value', path: 'command', actualType: typeof name, expected: Object.keys(commandSchemas).join(' | '), suggestion: 'Select a supported command context.' }])
  }
  const diagnostics = [] as import('./validation').ConfigDiagnostic[]
  validateSchema(project, schema, `commands.${name}`, diagnostics)
  validateSchema(overrides, schema, `commands.${name}`, diagnostics)
  if (diagnostics.length) {
    throw new ConfigValidationError(diagnostics)
  }
  const values: Record<string, unknown> = {}
  const origins: Record<string, ConfigOrigin> = {}
  function clearOrigins(field: string) {
    for (const path of Object.keys(origins)) {
      if (path === field || path.startsWith(`${field}.`)) {
        delete origins[path]
      }
    }
  }
  function merge(target: Record<string, unknown>, input: object, source: ConfigOrigin, prefix = '') {
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) {
        continue
      }
      const field = appendConfigPath(prefix, key)
      if (isRecord(value)) {
        const mergingObject = Object.hasOwn(target, key) && isRecord(target[key])
        if (!mergingObject) {
          clearOrigins(field)
        }
        else if (Object.keys(value).length) {
          delete origins[field]
        }
        const child = mergingObject ? target[key] as Record<string, unknown> : {}
        Object.defineProperty(target, key, { value: child, enumerable: true, configurable: true, writable: true })
        merge(child, value, source, field)
        if (!Object.keys(child).length) {
          origins[field] = source
        }
      }
      else {
        clearOrigins(field)
        Object.defineProperty(target, key, { value: Array.isArray(value) ? [...value] : value, enumerable: true, configurable: true, writable: true })
        origins[field] = source
      }
    }
  }
  merge(values, defaults[name], 'default')
  if (name === 'init' && options.entry === 'cli') {
    merge(values, { preset: 'standard' }, 'default')
  }
  merge(values, project, 'project')
  merge(values, overrides, 'cli')
  if (name === 'create' && values['type'] === undefined) {
    values['type'] = values['defaultTemplate']
    origins['type'] = origins['defaultTemplate']!
  }
  assertMonorepoConfig({ commands: { [name]: values } })
  return { command: name, values: values as CommandConfig<Name>, origins }
}

/** Separate the config contract from command-only controls such as cwd, apply and signals. */
export function selectCommandOverrides<Name extends ConfigCommand>(name: Name, input: object): Partial<CommandConfig<Name>> {
  const fields = commandSchemas[name].fields!
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => Object.hasOwn(fields, key) && value !== undefined)) as Partial<CommandConfig<Name>>
}
