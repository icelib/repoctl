import type { OrganizationPresetLayer } from '../../types/presets'
import { appendConfigPath } from '../config/paths'

/** Fixed package identities enter the existing remote template provider; catalog loading never fetches. */
export function presetTemplateDeclarations(layers: OrganizationPresetLayer[]) {
  return layers.flatMap(layer => Object.entries(layer.manifest.templates ?? {}).map(([key, value]) => ({
    key,
    value: { ...value, remote: { kind: 'npm' as const, packageName: layer.source.packageName, version: layer.source.version } },
    configFile: layer.source.manifestFile,
    configPath: appendConfigPath('templates', key),
    preset: { packageName: layer.source.packageName, version: layer.source.version },
  })))
}
