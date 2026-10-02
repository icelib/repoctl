import type { ConfigValueSource, OrganizationPresetLayer } from '../../types/presets'

/** Later preset recommendations replace an earlier reason for the same supported capability. */
export function presetRecommendations(layers: OrganizationPresetLayer[]) {
  const recommendations = new Map<string, { id: string, reason?: string, source: ConfigValueSource }>()
  for (const layer of layers) {
    for (const capability of layer.manifest.capabilities ?? []) {
      recommendations.set(capability.id, { ...capability, source: { kind: 'preset', file: layer.source.manifestFile, packageName: layer.source.packageName, version: layer.source.version } })
    }
  }
  return [...recommendations.values()]
}
