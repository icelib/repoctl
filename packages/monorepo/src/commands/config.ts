import type { MonorepoConfig } from '../types'
import type { ConfigValueSource, OrganizationPresetDiagnostic } from '../types/presets'
import { loadMonorepoConfigDetails } from '../core/config'
import { sanitizeConfigReport } from '../core/config/inspection'
import { presetRecommendations } from '../core/presets/recommendations'

export interface ConfigInspection {
  cwd: string
  file: string | null
  config: MonorepoConfig
  sources?: Record<string, ConfigValueSource>
  layers?: Array<{ source: ConfigValueSource, config: ReturnType<typeof sanitizeConfigReport> }>
  presetDiagnostics?: OrganizationPresetDiagnostic[]
  capabilities?: Array<{ id: string, reason?: string, source: ConfigValueSource }>
}

export async function inspectMonorepoConfig(cwd: string): Promise<ConfigInspection> {
  const { file, config, sources, sourceLayers, presets } = await loadMonorepoConfigDetails(cwd)
  return {
    cwd,
    file,
    config,
    ...(config.presets?.length
      ? {
          sources,
          layers: sourceLayers.map(layer => ({ source: layer.source, config: sanitizeConfigReport(layer.config) })),
          presetDiagnostics: presets.diagnostics,
          capabilities: presetRecommendations(presets.layers),
        }
      : {}),
  }
}
