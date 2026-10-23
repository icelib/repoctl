import type { ConsumerEntry, PackedManifest } from '../types'

export function consumerRuntimeAssets(manifest: PackedManifest): Set<string> {
  const assets = manifest.repoctl?.packageCheck?.runtimeAssets ?? []
  const result = new Set<string>()
  if (!Array.isArray(assets)) {
    throw new TypeError(`Package ${manifest.name} repoctl.packageCheck.runtimeAssets must list exact export subpaths.`)
  }
  for (const asset of assets) {
    if (typeof asset !== 'string' || (asset !== '.' && !asset.startsWith('./')) || asset.includes('*') || asset.includes('\\') || asset.split('/').includes('..')) {
      throw new Error(`Package ${manifest.name} repoctl.packageCheck.runtimeAssets must list exact export subpaths.`)
    }
    result.add(asset)
  }
  return result
}

/** Resolve resources through the consumer's real export map without executing browser globals. */
export function consumerAssetSource(entry: ConsumerEntry, specifier: string, installed: string): string {
  const resolve = entry.format === 'esm'
    ? `process.getBuiltinModule("node:url").fileURLToPath(import.meta.resolve(${JSON.stringify(specifier)}))`
    : `require.resolve(${JSON.stringify(specifier)})`
  return [
    'const fs = process.getBuiltinModule("node:fs");',
    'const path = process.getBuiltinModule("node:path");',
    `const root = fs.realpathSync(${JSON.stringify(installed)});`,
    `const filename = fs.realpathSync(${resolve});`,
    `const expected = fs.realpathSync(path.resolve(root, ${JSON.stringify(entry.target)}));`,
    'const relative = path.relative(root, filename);',
    'if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) || filename !== expected || !fs.statSync(filename).isFile()) throw new Error("Exported runtime asset does not resolve to its checked package file.");',
    'fs.readFileSync(filename);',
  ].join('\n')
}
