import type { MaintenancePresetUpgrade, MaintenanceUpgradeOptions } from './types'
import { Buffer } from 'node:buffer'
import { normalize } from 'pathe'
import { loadMonorepoConfigDetails } from '../../core/config'
import { readOptional } from '../../core/file-transaction/paths'
import { parsePresetBaseline, presetBaselinePath } from '../../core/presets/asset-plan/baseline'
import { planOrganizationPresetAssets } from '../../core/presets/asset-plan/plan'
import { presetVersion } from '../../core/presets/reference'
import { capturePresetCheckout } from './presets/bytes'
import { maintenanceGit } from './process'
import { lockedMaintenanceVersion } from './versions'

export function exactPresetDependency(manifest: unknown, packageName: string): string | null {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Maintenance requires a root package manifest on both sides.')
  }
  const root = manifest as Record<string, unknown>
  const entries = ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((key) => {
    const group = root[key]
    return group && typeof group === 'object' && Object.hasOwn(group, packageName)
      ? [(group as Record<string, unknown>)[packageName]]
      : []
  })
  if (!entries.length) {
    return null
  }
  if (entries.length !== 1 || !presetVersion.accepts(entries[0])) {
    throw new Error(`Maintenance requires one exact root dependency for preset ${packageName}.`)
  }
  return entries[0] as string
}

/** Only configured direct root packages and previously adopted files enter automatic maintenance. */
export async function planMaintenancePresets(options: MaintenanceUpgradeOptions, head: string, before: string, after: string): Promise<MaintenancePresetUpgrade | undefined> {
  // Preparation already resolved the root identity; transactions use portable separators.
  const rootDir = normalize(options.cwd)
  const loaded = await loadMonorepoConfigDetails(options.cwd, { refresh: true })
  const references = [...new Map((loaded.config.presets ?? []).map(reference => [reference.packageName, reference])).values()]
  const fromManifest = JSON.parse(maintenanceGit(options.cwd, ['show', `${options.base}:package.json`]))
  const toManifest = JSON.parse(maintenanceGit(options.cwd, ['show', `${head}:package.json`]))
  const records = maintenanceGit(options.cwd, ['ls-tree', '-r', '--name-only', options.base, '--', '.repoctl/baselines/presets']).split('\n').filter(Boolean)
  for (const filename of records) {
    const baseline = parsePresetBaseline(Buffer.from(maintenanceGit(options.cwd, ['show', `${options.base}:${filename}`])), filename)
    const name = baseline.source.packageName
    const from = exactPresetDependency(fromManifest, name)
    const to = exactPresetDependency(toManifest, name)
    if (from && (!to || (from !== to && !references.some(reference => reference.packageName === name)))) {
      throw new Error(`Preset removal or configuration changes require manual review: ${name}.`)
    }
  }
  if (!references.length) {
    return undefined
  }
  const result: MaintenancePresetUpgrade = { versions: [], plan: null, checkout: null, skipped: [] }
  const targets: string[] = []
  for (const reference of references) {
    const from = exactPresetDependency(fromManifest, reference.packageName)
    const to = exactPresetDependency(toManifest, reference.packageName)
    if (!from || !to) {
      throw new Error(`Preset installation or removal needs explicit review: ${reference.packageName}.`)
    }
    if (lockedMaintenanceVersion(before, reference.packageName, true) !== from
      || lockedMaintenanceVersion(after, reference.packageName, true) !== to || reference.version !== to) {
      throw new Error(`Preset configuration, committed dependencies and frozen lockfile must agree: ${reference.packageName}.`)
    }
    const change = { packageName: reference.packageName, from, to, status: from === to ? 'unchanged' as const : 'changed' as const, reason: from === to ? 'root-preset-version-unchanged' : 'root-preset-version-changed' }
    result.versions.push(change)
    if (change.status === 'unchanged') {
      continue
    }
    const layer = loaded.presets.layers.find(layer => layer.source.packageName === reference.packageName && layer.source.version === to)!
    for (const asset of layer.manifest.assets ?? []) {
      const filename = presetBaselinePath(asset.target)
      const content = await readOptional(rootDir, filename)
      if (!content) {
        result.skipped.push(asset.target)
        continue
      }
      const baseline = parsePresetBaseline(content, filename)
      const committed = parsePresetBaseline(Buffer.from(maintenanceGit(options.cwd, ['show', `${options.base}:${filename}`])), filename)
      if (baseline.source.packageName !== reference.packageName || baseline.source.path !== asset.source
        || committed.source.packageName !== reference.packageName || committed.source.path !== asset.source) {
        throw new Error(`Preset ownership or source changed; review explicit adoption: ${asset.target}.`)
      }
      targets.push(asset.target)
    }
  }
  result.versions.sort((a, b) => a.packageName.localeCompare(b.packageName))
  result.skipped.sort()
  if (targets.length) {
    result.plan = await planOrganizationPresetAssets(options.cwd, targets)
    if (result.plan.status !== 'blocked') {
      result.checkout = await capturePresetCheckout(options.cwd, result.plan)
    }
  }
  return result
}

export function assertMaintenancePresetLocks(presets: MaintenancePresetUpgrade | undefined, lockfile: string) {
  for (const change of presets?.versions ?? []) {
    if (lockedMaintenanceVersion(lockfile, change.packageName, true) !== change.to) {
      throw new Error(`Asset dependency resolution changed the target preset version: ${change.packageName}.`)
    }
  }
}
