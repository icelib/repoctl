import type { PackedManifest } from '../../package-check/types'
import type { SnapshotReport } from './types'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'
import { clearWorkspaceCache, getWorkspaceData } from '../../../core/workspace'
import { parseSpecifier } from '../../deps/specifiers'
import { dependencyReferences } from '../../package-check/dependencies'
import { snapshotMetadata } from './identity'

/** Mutate only the extracted copy; pnpm still resolves catalogs and packs publication metadata. */
export async function writeSnapshotManifests(source: string, report: SnapshotReport) {
  clearWorkspaceCache()
  const workspace = await getWorkspaceData(source, { ignorePrivatePackage: false, ignoreRootPackage: false })
  const configuration = parse(await readFile(path.join(source, 'pnpm-workspace.yaml'), 'utf8'))
  const byName = new Map(workspace.packages.map(pkg => [pkg.manifest.name, pkg]))
  const byDirectory = new Map(workspace.packages.map(pkg => [path.resolve(pkg.rootDir), pkg]))
  const versions = new Map(report.packages.map(pkg => [pkg.name, pkg.version]))
  for (const pkg of workspace.packages) {
    const manifest = JSON.parse(await readFile(path.join(pkg.rootDir, 'package.json'), 'utf8'))
    const version = versions.get(manifest.name)
    if (!version) {
      continue
    }
    manifest.version = version
    manifest.repoctlSnapshot = snapshotMetadata(report)
    // A snapshot has exactly one publication target and must pack this directory.
    if (manifest.publishConfig?.directory) {
      throw new Error(`Snapshot package ${manifest.name} uses unsupported publishConfig.directory; publish built files through files/exports instead.`)
    }
    manifest.publishConfig = { ...manifest.publishConfig, tag: report.tag, registry: report.registry }
    for (const reference of dependencyReferences(manifest as PackedManifest, pkg.rootDir, true)) {
      const value = manifest[reference.field][reference.alias] as string
      const catalogTarget = parseSpecifier(reference.alias, value, configuration).source
      const target = reference.directory ? byDirectory.get(path.resolve(reference.directory)) : byName.get(catalogTarget ?? reference.name)
      if (target) {
        const targetVersion = versions.get(target.manifest.name!)
        if (!targetVersion) {
          if (reference.field !== 'devDependencies') {
            throw new Error(`Public snapshot ${manifest.name} depends on private workspace ${target.manifest.name}.`)
          }
          continue
        }
        manifest[reference.field][reference.alias] = reference.alias === target.manifest.name ? targetVersion : `npm:${target.manifest.name}@${targetVersion}`
      }
      else if (reference.protocol !== 'registry') {
        throw new Error(`Snapshot cannot publish unresolved local dependency ${manifest.name}: ${reference.alias}.`)
      }
    }
    await writeFile(path.join(pkg.rootDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
}
