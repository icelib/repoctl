import type { WorkspacePackageWithJsonPath } from '../../types'
import { readFile } from 'node:fs/promises'
import path from 'pathe'
import { parse } from 'yaml'
import { record } from '../deps/files'
import { git } from './git'

export function resolveCatalog(alias: string, specifier: string, configuration: Record<string, unknown>) {
  if (!specifier.startsWith('catalog:')) {
    return specifier
  }
  const catalog = specifier.slice(8) || 'default'
  const named = record(configuration['catalogs'])
  const ambiguous = catalog === 'default' && configuration['catalog'] != null && named?.['default'] != null
  const entries = ambiguous
    ? undefined
    : catalog === 'default'
      ? record(configuration['catalog'] ?? named?.['default'])
      : record(named?.[catalog])
  const value = entries?.[alias]
  if (typeof value !== 'string' || value.startsWith('catalog:')) {
    throw new Error(`Cannot resolve documentation runtime catalog dependency: ${alias} (${specifier})`)
  }
  return value
}

function readCatalogConfiguration(content: string) {
  const configuration = record(parse(content))
  if (!configuration) {
    throw new Error('Cannot read documentation workspace dependency configuration')
  }
  return configuration
}

/** Compare only catalog entries referenced by this unchanged published manifest. */
export async function changedCatalogDependencies(source: string, publishedSha: string, manifest: WorkspacePackageWithJsonPath['manifest']) {
  const fields = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'] as const
  const references = fields.flatMap(field => Object.entries(manifest[field] ?? {})
    .filter(([, specifier]) => specifier.startsWith('catalog:'))
    .map(([alias, specifier]) => ({ field, alias, specifier })))
  if (!references.length) {
    return []
  }
  const published = readCatalogConfiguration(git(source, ['show', `${publishedSha}:pnpm-workspace.yaml`]))
  const frozen = readCatalogConfiguration(await readFile(path.join(source, 'pnpm-workspace.yaml'), 'utf8'))
  return references.flatMap(({ field, alias, specifier }) => {
    const before = resolveCatalog(alias, specifier, published)
    const after = resolveCatalog(alias, specifier, frozen)
    return before === after ? [] : [`${field}.${alias} (${specifier}: ${before} -> ${after})`]
  })
}
