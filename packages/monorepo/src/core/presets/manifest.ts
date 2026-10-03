import type { OrganizationPresetManifest } from '../../types/presets'
import type { ConfigDiagnostic } from '../config/validation'
import { validRange } from 'semver'
import { listToolingCapabilities } from '../../commands/tooling-capabilities/registry'
import { assertMonorepoConfig, ConfigValidationError } from '../config/validation'
import { commandSchemas } from '../config/validation/commands'
import { array, isRecord, nonempty, object, opaque, record, string, validateSchema } from '../config/validation/schema'
import { presetAssetTarget } from './assets'
import { presetRelativePath } from './files'
import { presetReferencesSchema } from './reference'

const templateValue = commandSchemas.create.fields!['templateMap']!.values!
const schema = object({
  schemaVersion: { expected: '1', accepts: value => value === 1 },
  requires: object({ repoctl: { expected: 'semantic version range', accepts: value => typeof value === 'string' && Boolean(validRange(value)) } }, ['repoctl']),
  extends: presetReferencesSchema,
  config: opaque,
  templates: record({ ...templateValue, expected: 'template definition object', accepts: isRecord }),
  capabilities: array(object({ id: nonempty, reason: string }, ['id'])),
  assets: array(object({ source: nonempty, target: nonempty }, ['source', 'target'])),
}, ['schemaVersion', 'requires'])

export function parseOrganizationPresetManifest(value: unknown): OrganizationPresetManifest {
  const diagnostics: ConfigDiagnostic[] = []
  validateSchema(value, schema, 'preset', diagnostics)
  if (diagnostics.length) {
    throw new ConfigValidationError(diagnostics)
  }
  const manifest = value as OrganizationPresetManifest
  if (manifest.config !== undefined) {
    assertMonorepoConfig(manifest.config)
    if (Object.keys(manifest.config).some(key => key === 'presets' || key === 'extends' || key === '_layers' || key.startsWith('$'))) {
      throw new Error('Use preset.extends for package references; preset.config contains resolved repoctl values only.')
    }
    if (manifest.config.commands?.create?.templatesDir !== undefined || manifest.config.commands?.create?.templateMap !== undefined) {
      throw new Error('Declare package templates in preset.templates so their source identity remains explicit.')
    }
  }
  const capabilities = new Set<string>(listToolingCapabilities().map(item => item.id))
  const selected = new Set<string>()
  for (const recommendation of manifest.capabilities ?? []) {
    if (!capabilities.has(recommendation.id) || selected.has(recommendation.id)) {
      throw new Error('Preset capability recommendations must use unique supported capability IDs.')
    }
    selected.add(recommendation.id)
  }
  const targets = new Set<string>()
  for (const asset of manifest.assets ?? []) {
    presetRelativePath(asset.source)
    presetAssetTarget(asset.target)
    if (targets.has(asset.target)) {
      throw new Error('Each preset asset target must be declared once.')
    }
    targets.add(asset.target)
  }
  for (const [key, template] of Object.entries(manifest.templates ?? {})) {
    if (!key.trim() || key !== key.trim()) {
      throw new Error('Preset template keys must be nonempty and contain no surrounding whitespace.')
    }
    presetRelativePath(template.source)
    presetRelativePath(template.target)
    if ('remote' in template) {
      throw new Error('Preset templates use the exact npm package declaring them; external remote overrides are not supported.')
    }
  }
  return manifest
}
