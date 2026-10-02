import type { ConsumerEntry, PackedManifest } from './types'

function resolveTarget(value: unknown, conditions: Set<string>): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(item => resolveTarget(item, conditions)).find(Boolean)
  }
  if (value && typeof value === 'object') {
    for (const [key, target] of Object.entries(value)) {
      if (conditions.has(key)) {
        const resolved = resolveTarget(target, conditions)
        if (resolved) {
          return resolved
        }
      }
    }
  }
}

function declaresCondition(value: unknown, condition: string): boolean {
  return !!value && typeof value === 'object' && Object.entries(value).some(([key, target]) => key === condition || declaresCondition(target, condition))
}

function expand(subpath: string, target: string, files: string[]) {
  if (!subpath.includes('*') || !target.includes('*')) {
    return [{ subpath, target }]
  }
  const [prefix, suffix] = target.replace(/^\.\//u, '').split('*')
  return files.filter(file => file.startsWith(prefix!) && file.endsWith(suffix!)).map((file) => {
    const match = file.slice(prefix!.length, suffix ? -suffix.length : undefined)
    return { subpath: subpath.replaceAll('*', match), target: `./${file}` }
  })
}

/** Only exercise declared Node entrypoints; browser/assets/type-only paths are not Node modules. */
export function consumerEntries(manifest: PackedManifest, files: string[]): ConsumerEntry[] {
  const exports = manifest.exports
  const mappings: Record<string, unknown> = exports && typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some(key => key.startsWith('.'))
    ? exports as Record<string, unknown>
    : { '.': exports !== undefined ? exports : manifest.main ?? (files.includes('index.js') ? './index.js' : undefined) }
  const entries: ConsumerEntry[] = []
  for (const [subpath, value] of Object.entries(mappings)) {
    for (const format of ['esm', 'cjs'] as const) {
      const condition = format === 'esm' ? 'import' : 'require'
      const runtimeTarget = resolveTarget(value, new Set(['node', condition, 'default']))
      const runtime = !!runtimeTarget && /\.[cm]?js$/u.test(runtimeTarget)
      const target = runtime ? runtimeTarget : resolveTarget(value, new Set(['types', 'node', condition, 'default'])) ?? (subpath === '.' ? manifest.types : undefined)
      if (!target || (!runtime && !/\.d\.[cm]?ts$/u.test(target))) {
        continue
      }
      const targetFormat = /\.(?:mjs|mts)$/u.test(target) || (!/\.(?:cjs|cts)$/u.test(target) && manifest.type === 'module') ? 'esm' : 'cjs'
      if (targetFormat !== format && !declaresCondition(value, condition)) {
        continue
      }
      for (const expanded of expand(subpath, target, files)) {
        entries.push({ ...expanded, format, runtime })
      }
    }
  }
  return entries
}

export function supportsResolution(entries: ConsumerEntry[], subpath: string, kind: string, legacy: boolean) {
  entries = entries.filter(entry => entry.runtime)
  if (kind === 'node10') {
    return legacy && entries.some(entry => entry.subpath === subpath)
  }
  return entries.some(entry => entry.subpath === subpath && (kind === 'bundler' || entry.format === (kind === 'node16-cjs' ? 'cjs' : 'esm')))
}
