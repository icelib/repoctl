import type { OrganizationPresetDiagnostic, OrganizationPresetReference, OrganizationPresetResolution, OrganizationPresetSource } from '../../types/presets'
import type { ConfigDiagnostic } from '../config/validation'
import path from 'node:path'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { normalize } from 'pathe'
import { satisfies } from 'semver'
import { version as repoctlVersion } from '../../constants'
import { isRecord, validateSchema } from '../config/validation/schema'
import { canonicalDirectory } from '../file-transaction/paths'
import { installedPresetDirectory, parsePresetJson, presetManifestName, readPresetFile } from './files'
import { parseOrganizationPresetManifest } from './manifest'
import { presetReferencesSchema } from './reference'

/** Read installed data only: no importing package entrypoints, download, cache write or lifecycle execution. */
export async function resolveOrganizationPresets(cwd: string, references: OrganizationPresetReference[]): Promise<OrganizationPresetResolution> {
  const result: OrganizationPresetResolution = { workspaceDir: normalize(path.resolve(cwd)), layers: [], diagnostics: [], inputs: [], locations: [] }
  if (!Array.isArray(references)) {
    result.diagnostics.push({ id: 'preset.invalid-reference', status: 'fail', path: 'presets', source: null, detail: 'Preset references must be an array of exact npm package identities.' })
    return result
  }
  const invalid: ConfigDiagnostic[] = []
  validateSchema(references, presetReferencesSchema, 'presets', invalid)
  if (invalid.length || references.length > 64) {
    result.diagnostics.push(...invalid.map(item => ({ id: 'preset.invalid-reference' as const, status: 'fail' as const, path: item.path, source: null, detail: item.suggestion })))
    if (references.length > 64) {
      result.diagnostics.push({ id: 'preset.limit', status: 'fail', path: 'presets', source: null, detail: 'A project can reference at most 64 presets.' })
    }
    return result
  }
  if (!references.length) {
    return result
  }
  const workspaceDir = await canonicalDirectory(await findWorkspaceDir(cwd) ?? cwd)
  result.workspaceDir = workspaceDir
  const inputs = new Map<string, string>()
  const versions = new Map<string, string>()
  const seen = new Map<string, OrganizationPresetSource>()
  const visited = new Set<string>()
  async function readJson(root: string, relative: string) {
    const file = await readPresetFile(root, relative)
    const previous = inputs.get(file.filename)
    if (previous && previous !== file.hash) {
      throw new Error('A preset input changed while resolving its dependencies.')
    }
    inputs.set(file.filename, file.hash)
    return { file, value: parsePresetJson(file.content, relative) }
  }
  const diagnostic = (id: OrganizationPresetDiagnostic['id'], field: string, source: string | null, detail: string, status: 'fail' | 'warn' = 'fail') => {
    result.diagnostics.push({ id, status, path: field, source, detail })
  }
  async function visit(reference: OrganizationPresetReference, from: string, consumer: unknown, field: string, chain: string[]) {
    const id = `${reference.packageName}@${reference.version}`
    if (chain.includes(id)) {
      diagnostic('preset.cycle', field, id, `Preset dependency cycle: ${[...chain, id].join(' -> ')}`)
      return
    }
    if (chain.length >= 16 || (!visited.has(id) && visited.size >= 64)) {
      diagnostic('preset.limit', field, id, 'Preset resolution allows at most 16 dependency levels and 64 packages.')
      return
    }
    visited.add(id)
    if (versions.has(reference.packageName) && versions.get(reference.packageName) !== reference.version) {
      diagnostic('preset.conflicting-version', field, id, 'The same preset package cannot contribute multiple versions to one project.')
      return
    }
    const dependencies = isRecord(consumer) && isRecord(consumer['dependencies']) ? consumer['dependencies'] : {}
    const development = isRecord(consumer) && isRecord(consumer['devDependencies']) ? consumer['devDependencies'] : {}
    if (dependencies[reference.packageName] !== reference.version && development[reference.packageName] !== reference.version) {
      diagnostic('preset.invalid-reference', field, id, 'Declare the preset as an exact dependency in the consuming package.json before referencing it.')
      return
    }
    try {
      const directory = await installedPresetDirectory(reference.packageName, from)
      if (!directory) {
        diagnostic('preset.missing-package', field, id, 'The referenced preset is not installed. Install the declared dependency explicitly, then inspect again.')
        return
      }
      result.locations.push({ packageName: reference.packageName, fromDirectory: from, directory })
      const metadata = await readJson(directory, 'package.json')
      if (!isRecord(metadata.value) || metadata.value['name'] !== reference.packageName || metadata.value['version'] !== reference.version) {
        diagnostic('preset.version-mismatch', field, id, 'The installed package name/version does not match the exact preset reference.')
        return
      }
      const contents = await readJson(directory, presetManifestName)
      const manifest = parseOrganizationPresetManifest(contents.value)
      if (!satisfies(repoctlVersion, manifest.requires.repoctl)) {
        diagnostic('preset.incompatible', field, id, 'The installed repoctl version does not satisfy this preset’s requires.repoctl range.')
        return
      }
      const source: OrganizationPresetSource = { ...reference, id, directory, manifestFile: contents.file.filename, manifestHash: contents.file.hash, packageJsonHash: metadata.file.hash }
      const prior = seen.get(id)
      if (prior) {
        if (prior.manifestHash !== source.manifestHash || prior.packageJsonHash !== source.packageJsonHash) {
          diagnostic('preset.invalid-manifest', field, id, 'The same fixed package identity resolves to different installed contents.')
        }
        else {
          diagnostic('preset.duplicate', field, id, 'This fixed preset was already loaded; its configuration is applied once.', 'warn')
        }
        return
      }
      versions.set(reference.packageName, reference.version)
      for (const [index, child] of (manifest.extends ?? []).entries()) {
        await visit(child, directory, metadata.value, `${field}.extends[${index}]`, [...chain, id])
      }
      seen.set(id, source)
      result.layers.push({ source, manifest })
    }
    catch (error) {
      diagnostic('preset.invalid-manifest', field, id, error instanceof Error ? error.message : 'The installed preset could not be read as validated JSON.')
    }
  }
  try {
    const root = await readJson(workspaceDir, 'package.json')
    for (const [index, reference] of references.entries()) {
      await visit(reference, workspaceDir, root.value, `presets[${index}]`, [])
    }
  }
  catch {
    diagnostic('preset.invalid-reference', 'presets', null, 'Preset references require a readable workspace package.json with exact dependency declarations.')
  }
  result.inputs = [...inputs].map(([filename, hash]) => ({ path: filename, hash })).sort((left, right) => left.path.localeCompare(right.path))
  return result
}
