import type { PackedManifest } from '../../package-check/types'
import type { SnapshotReport } from './types'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'
import { clearWorkspaceCache, getWorkspaceData } from '../../../core/workspace'
import { dependencyReferences } from '../../package-check/dependencies'
import { snapshotMetadata } from './identity'

/** Remember alias targets before publication URLs obscure their package names. */
export type SnapshotWorkspaceReferences = Map<string, Map<string, string>>

/** Keep workspace edges intact until build and pack lifecycle scripts have finished. */
export async function writeSnapshotManifests(source: string, report: SnapshotReport) {
  clearWorkspaceCache()
  const workspace = await getWorkspaceData(source, { ignorePrivatePackage: false, ignoreRootPackage: false })
  const configuration = parse(await readFile(path.join(source, 'pnpm-workspace.yaml'), 'utf8'))
  const byName = new Map(workspace.packages.map(pkg => [pkg.manifest.name, pkg]))
  const byDirectory = new Map(workspace.packages.map(pkg => [path.resolve(pkg.rootDir), pkg]))
  const versions = new Map(report.packages.map(pkg => [pkg.name, pkg.version]))
  const references: SnapshotWorkspaceReferences = new Map()
  for (const pkg of workspace.packages) {
    const manifest = JSON.parse(await readFile(path.join(pkg.rootDir, 'package.json'), 'utf8'))
    const version = versions.get(manifest.name)
    const targets = new Map<string, string>()
    if (version) {
      manifest.version = version
      manifest.repoctlSnapshot = snapshotMetadata(report)
      if (manifest.publishConfig?.directory) {
        throw new Error(`Snapshot package ${manifest.name} uses unsupported publishConfig.directory; publish built files through files/exports instead.`)
      }
      manifest.publishConfig = { ...manifest.publishConfig, tag: report.tag, registry: report.registry }
    }
    for (const reference of dependencyReferences(manifest as PackedManifest, pkg.rootDir, true)) {
      const value = manifest[reference.field][reference.alias] as string
      const catalog = value.startsWith('catalog:') ? value.slice(8) || 'default' : undefined
      const catalogValue = catalog === 'default' ? (configuration.catalog ?? configuration.catalogs?.default)?.[reference.alias] : catalog ? configuration.catalogs?.[catalog]?.[reference.alias] : undefined
      const resolved = typeof catalogValue === 'string'
        ? dependencyReferences({ [reference.field]: { [reference.alias]: catalogValue } }, pkg.rootDir, true)[0]!
        : reference
      const target = resolved.directory ? byDirectory.get(path.resolve(resolved.directory)) : byName.get(resolved.name)
      if (target) {
        const targetVersion = versions.get(target.manifest.name!)
        if (version && !targetVersion && reference.field !== 'devDependencies') {
          throw new Error(`Public snapshot ${manifest.name} depends on private workspace ${target.manifest.name}.`)
        }
        // Private build consumers also need their dependency graph after public
        // versions change. Bare versions become external with pnpm's defaults.
        manifest[reference.field][reference.alias] = reference.alias === target.manifest.name ? 'workspace:*' : `workspace:${target.manifest.name}@*`
        if (version && targetVersion) {
          targets.set(`${reference.field}.${reference.alias}`, target.manifest.name!)
        }
      }
      else if (version && reference.protocol !== 'registry') {
        throw new Error(`Snapshot cannot publish unresolved local dependency ${manifest.name}: ${reference.alias}.`)
      }
    }
    if (version) {
      references.set(manifest.name, targets)
    }
    await writeFile(path.join(pkg.rootDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
  return references
}
