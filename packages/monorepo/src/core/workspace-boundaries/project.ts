import { loadMonorepoConfigDetails } from '../config'
import { BoundaryConfigError, parseBoundariesConfig } from './config'

/** C12 defaults intentionally discard null; a malformed policy must not disappear. */
function rejectNull(value: unknown, field: string) {
  if (value === null) {
    throw new BoundaryConfigError(field, 'Null is not a valid boundary policy value; omit optional fields instead.')
  }
  if (typeof value === 'object' && value) {
    for (const [key, child] of Object.entries(value)) {
      rejectNull(child, `${field}.${key}`)
    }
  }
}

export async function loadBoundaryConfiguration(cwd: string) {
  const loaded = await loadMonorepoConfigDetails(cwd, { refresh: true })
  for (const layer of loaded.rawLayers) {
    rejectNull(layer.boundaries, 'boundaries')
  }
  return {
    file: loaded.file,
    configured: loaded.config.boundaries !== undefined,
    config: parseBoundariesConfig(loaded.config.boundaries === undefined ? {} : loaded.config.boundaries),
  }
}
