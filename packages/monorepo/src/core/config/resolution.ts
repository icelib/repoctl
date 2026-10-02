import type { MonorepoConfig } from '../../types'
import type { ConfigSourceLayer, ConfigValueSource } from '../../types/presets'
import { chinaMirrorsEnvs } from '../../commands/mirror/sources'
import { mergeConfigValues } from './merge'
import { assertMonorepoConfig, ConfigValidationError } from './validation'
import { commandSchemas } from './validation/commands'
import { validateSchema } from './validation/schema'

export type ConfigCommand = keyof NonNullable<MonorepoConfig['commands']>
export type CommandConfig<Name extends ConfigCommand> = NonNullable<NonNullable<MonorepoConfig['commands']>[Name]>
export type CommandConfigOverrides<Name extends ConfigCommand> = { [Key in keyof CommandConfig<Name>]?: CommandConfig<Name>[Key] | undefined }
export type ConfigOrigin = 'default' | 'project' | 'cli'
export interface ResolvedCommandConfig<Name extends ConfigCommand = ConfigCommand> {
  command: Name
  values: CommandConfig<Name>
  /** Dot paths relative to the command block; arrays are replaced as a whole. */
  origins: Record<string, ConfigOrigin>
  /** Precise preset/project identity, while origins keeps its existing public union. */
  sources: Record<string, ConfigValueSource>
}

const defaults = {
  ai: { baseDir: 'agentic/prompts', force: false, format: 'md' },
  clean: { autoConfirm: false, dryRun: false, ignorePackages: [], includePrivate: true },
  create: { offline: false, renameJson: false, defaultTemplate: 'tsdown' },
  deps: { groups: [] },
  doctor: {},
  init: { skipReadme: false, skipPkgJson: false, skipChangeset: false, skipIssueTemplateConfig: false, tooling: [], force: false },
  mirror: { env: chinaMirrorsEnvs },
  release: { qualityScripts: ['build', 'lint', 'test'], hooks: { verify: [], beforeVersion: [], afterVersion: [], beforePublish: [], afterPublish: [] } },
  upgrade: { interactive: false, core: false, outDir: '', skipOverwrite: false, yes: false, overwrite: false, noOverwrite: false, overwriteRelease: false, mergeTargets: true, scripts: {}, skipChangesetMarkdown: true },
} satisfies { [Name in ConfigCommand]: CommandConfig<Name> }

/** Shared by inspection and execution. Undefined never masks a project/default value. */
export function resolveCommandValues<Name extends ConfigCommand>(name: Name, project: CommandConfig<Name> = {} as CommandConfig<Name>, overrides: CommandConfigOverrides<Name> = {}, options: { entry?: 'api' | 'cli', layers?: ConfigSourceLayer[] } = {}): ResolvedCommandConfig<Name> {
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
  const { values, sources } = mergeConfigValues([
    { source: { kind: 'default' }, values: defaults[name] },
    ...(name === 'init' && options.entry === 'cli' ? [{ source: { kind: 'default' as const }, values: { preset: 'standard' } }] : []),
    ...(options.layers ? options.layers.map(layer => ({ source: layer.source, values: layer.config.commands?.[name] ?? {} })) : [{ source: { kind: 'project' as const }, values: project }]),
    { source: { kind: 'cli' }, values: overrides },
  ])
  const origins = Object.fromEntries(Object.entries(sources).map(([field, source]) => [field, source.kind === 'preset' ? 'project' : source.kind])) as Record<string, ConfigOrigin>
  if (name === 'create' && values['type'] === undefined) {
    values['type'] = values['defaultTemplate']
    origins['type'] = origins['defaultTemplate']!
    sources['type'] = sources['defaultTemplate']!
  }
  assertMonorepoConfig({ commands: { [name]: values } })
  return { command: name, values: values as CommandConfig<Name>, origins, sources }
}

/** Separate the config contract from command-only controls such as cwd, apply and signals. */
export function selectCommandOverrides<Name extends ConfigCommand>(name: Name, input: object): Partial<CommandConfig<Name>> {
  const fields = commandSchemas[name].fields!
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => Object.hasOwn(fields, key) && value !== undefined)) as Partial<CommandConfig<Name>>
}
