import YAML from 'yaml'
import fs from '../../../utils/fs'

export type Data = Record<string, unknown>
export const dependencyGroups = ['dependencies', 'devDependencies', 'optionalDependencies'] as const

export function record(value: unknown): Data | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Data : undefined
}

export async function readYaml(path: string) {
  try {
    const docs = YAML.parseAllDocuments(await fs.readFile(path, 'utf8'))
    if (docs.some(doc => doc.errors.length)) {
      return undefined
    }
    return docs.map(doc => record(doc.toJSON())).filter((doc): doc is Data => !!doc)
  }
  catch {
    return undefined
  }
}

export async function readLockfile(path: string) {
  const docs = await readYaml(path)
  // pnpm 12 prepends a separate package-manager/config dependency lock document.
  const candidates = docs?.filter((doc) => {
    const root = record(record(doc['importers'])?.['.'])
    return root && !('packageManagerDependencies' in root || 'configDependencies' in root)
  })
  if (candidates?.length !== 1 || String(candidates[0]!['lockfileVersion']) !== '9.0') {
    return undefined
  }
  return candidates[0]!
}

function catalogSpecifier(specifier: string, name: string, workspace: Data) {
  if (!specifier.startsWith('catalog:')) {
    return specifier
  }
  const catalog = specifier.slice(8)
  const named = record(workspace['catalogs'])
  const isDefault = !catalog || catalog === 'default'
  const duplicateDefault = workspace['catalog'] != null && named?.['default'] != null
  const values = isDefault
    ? duplicateDefault ? undefined : record(workspace['catalog'] ?? named?.['default'])
    : record(named?.[catalog])
  return values?.[name]
}

function effectiveManifest(manifest: Data, workspace: Data, lockfile: Data): Data {
  const autoInstallPeers = workspace['autoInstallPeers'] ?? record(lockfile['settings'])?.['autoInstallPeers'] ?? true
  if (autoInstallPeers !== true) {
    return manifest
  }
  if (manifest['dependencies'] !== undefined && !record(manifest['dependencies'])) {
    return manifest
  }
  const explicit = new Set(dependencyGroups.flatMap(group => Object.keys(record(manifest[group]) ?? {})))
  const peers = Object.fromEntries(Object.entries(record(manifest['peerDependencies']) ?? {}).filter(([name]) => !explicit.has(name)))
  return { ...manifest, dependencies: { ...peers, ...record(manifest['dependencies']) } }
}

export function compareManifest(originalManifest: Data, importer: Data, workspace: Data, lockfile: Data) {
  const manifest = effectiveManifest(originalManifest, workspace, lockfile)
  const mismatches: string[] = []
  const unknown: string[] = []
  for (const group of dependencyGroups) {
    if ((manifest[group] !== undefined && !record(manifest[group])) || (importer[group] !== undefined && !record(importer[group]))) {
      unknown.push(`${group} (unsupported dependency map)`)
      continue
    }
    const expected = record(manifest[group]) ?? {}
    const locked = record(importer[group]) ?? {}
    for (const [name, specifier] of Object.entries(expected)) {
      // optionalDependencies override dependencies; dependencies override devDependencies.
      if (group !== 'optionalDependencies' && name in (record(manifest['optionalDependencies']) ?? {})) {
        continue
      }
      if (group === 'devDependencies' && name in (record(manifest['dependencies']) ?? {})) {
        continue
      }
      const entry = record(locked[name])
      const desired = typeof specifier === 'string' ? catalogSpecifier(specifier, name, workspace) : undefined
      if (typeof desired !== 'string' || (name in locked && !entry) || (entry && (typeof entry['specifier'] !== 'string' || typeof entry['version'] !== 'string'))) {
        unknown.push(`${group}.${name}`)
        continue
      }
      let actual = entry?.['specifier']
      if (typeof specifier === 'string' && specifier.startsWith('catalog:') && actual === specifier) {
        const catalog = specifier.slice(8) || 'default'
        actual = record(record(record(lockfile['catalogs'])?.[catalog])?.[name])?.['specifier']
        if (typeof actual !== 'string') {
          unknown.push(`${group}.${name}`)
          continue
        }
      }
      if (actual !== desired) {
        const overrides = record(workspace['overrides']) ?? record(record(manifest['pnpm'])?.['overrides']) ?? {}
        if (Object.keys(overrides).some(key => key === name || key.includes(`${name}@`) || key.endsWith(`>${name}`))) {
          unknown.push(`${group}.${name} (override)`)
        }
        else {
          mismatches.push(`${group}.${name}`)
        }
      }
    }
    for (const name of Object.keys(locked)) {
      if (!(name in expected)) {
        mismatches.push(`${group}.${name} (removed)`)
      }
    }
  }
  return { mismatches, unknown }
}
