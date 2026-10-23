import type { MonorepoConfig } from '../../types'
import { createDefu } from 'defu'
import { splitConfigPath } from './paths'
import { isRecord } from './validation/schema'

/** Switching provider replaces its identity contract; same-provider objects retain normal preset merging. */
export function replaceDocsTarget(field: string, current: Record<string, unknown>, next: Record<string, unknown>) {
  const parts = splitConfigPath(field)
  const relative = parts[0] === 'commands' && parts[1] === 'docs' ? parts.slice(2) : parts
  return relative.length === 3 && relative[0] === 'sites' && ['preview', 'stable'].includes(relative[2]!)
    && (next['provider'] !== undefined || next['deployScript'] !== undefined)
    && current['provider'] !== next['provider']
}

/** Preserve C12's own defaults/array semantics while replacing switched target contracts. */
const mergeProjectValues = createDefu((object, key, value, namespace) => {
  const previous = object[key]
  if (isRecord(previous) && isRecord(value) && replaceDocsTarget(namespace ? `${namespace}.${String(key)}` : String(key), previous, value)) {
    object[key] = value
    return true
  }
  return false
})

export function mergeProjectConfig(...sources: Array<MonorepoConfig | null | undefined>): MonorepoConfig {
  return mergeProjectValues({}, ...sources.map(source => source ?? {}))
}
