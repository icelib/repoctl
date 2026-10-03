import type { LoadedMonorepoConfig } from '../../src/core/config'
import type { MonorepoConfig } from '../../src/types'
import path from 'pathe'

/** Keep source-only command mocks aligned with the complete configuration-loading contract. */
export function loadedConfigFixture(config: MonorepoConfig, file = '/repo/repoctl.config.mjs'): LoadedMonorepoConfig {
  return {
    file,
    files: [file],
    config,
    rawLayers: [],
    sources: {},
    sourceLayers: [{ source: { kind: 'project', file }, config }],
    presets: { workspaceDir: path.dirname(file), layers: [], diagnostics: [], inputs: [], locations: [] },
  }
}
