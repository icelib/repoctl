import type { ConfigValueSource } from '../../types/presets'
import { appendConfigPath } from './paths'
import { isRecord } from './validation/schema'

/** Preset boundaries merge objects and replace arrays, without changing C12's project merge. */
export function mergeConfigValues(layers: Array<{ source: ConfigValueSource, values: object }>) {
  const values: Record<string, unknown> = {}
  const sources: Record<string, ConfigValueSource> = {}
  function clear(field: string) {
    for (const key of Object.keys(sources)) {
      if (key === field || key.startsWith(`${field}.`)) {
        delete sources[key]
      }
    }
  }
  function merge(target: Record<string, unknown>, input: object, source: ConfigValueSource, prefix = '', parents = new Set<object>()) {
    const next = new Set(parents).add(input)
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) {
        continue
      }
      const field = appendConfigPath(prefix, key)
      if (isRecord(value) && !next.has(value)) {
        const existing = Object.hasOwn(target, key) && isRecord(target[key])
        if (!existing) {
          clear(field)
        }
        else if (Object.keys(value).length) {
          delete sources[field]
        }
        const child = existing ? target[key] as Record<string, unknown> : {}
        Object.defineProperty(target, key, { value: child, enumerable: true, configurable: true, writable: true })
        merge(child, value, source, field, next)
        if (!Object.keys(child).length) {
          sources[field] = source
        }
      }
      else {
        clear(field)
        Object.defineProperty(target, key, { value: Array.isArray(value) ? [...value] : value, enumerable: true, configurable: true, writable: true })
        sources[field] = source
      }
    }
  }
  for (const layer of layers) {
    merge(values, layer.values, layer.source)
  }
  return { values, sources }
}
