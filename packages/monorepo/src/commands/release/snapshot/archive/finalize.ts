import type { ExpectedWorkspaceLocator } from '../../../package-check/consumer/dependencies'
import type { PackedManifest } from '../../../package-check/types'
import type { SnapshotWorkspaceReferences } from '../manifests'
import type { SnapshotPackage, SnapshotReport } from '../types'
import { Buffer } from 'node:buffer'
import { satisfies, validRange } from 'semver'
import { dependencyReferences } from '../../../package-check/dependencies'
import { matchesSnapshotMetadata } from '../identity'
import { readSnapshotArchive, writeSnapshotArchive } from './index'

export interface SnapshotPublicationTarget {
  provider: 'npm' | 'pkg-pr-new'
  repository: string
}

interface SnapshotManifest extends PackedManifest {
  repoctlSnapshot?: unknown
  publishConfig?: { tag?: string, registry?: string }
}

/** Finalize only packed metadata, after every pack lifecycle script has completed. */
export async function finalizeSnapshotTarball(bytes: Uint8Array, pkg: SnapshotPackage, report: SnapshotReport, target: SnapshotPublicationTarget, references: SnapshotWorkspaceReferences) {
  if (target.provider === 'pkg-pr-new' && !/^[\w.-]+\/[\w.-]+$/.test(target.repository)) {
    throw new Error('Snapshot pkg.pr.new target requires an owner/repository identity.')
  }
  const entries = await readSnapshotArchive(bytes)
  const entry = entries.find(item => item.path === 'package/package.json')
  if (!entry || entry.type !== 'File') {
    throw new Error(`Snapshot tarball has no package/package.json: ${pkg.name}.`)
  }
  const manifest: SnapshotManifest = JSON.parse(entry.data.toString('utf8'))
  if (manifest.name !== pkg.name || manifest.version !== pkg.version || !matchesSnapshotMetadata(manifest.repoctlSnapshot, report)
    || manifest.publishConfig?.tag !== report.tag || manifest.publishConfig?.registry !== report.registry) {
    throw new Error(`Packed snapshot identity or publication target changed for ${pkg.name}.`)
  }
  const expected = new Map<string, ExpectedWorkspaceLocator>()
  for (const reference of dependencyReferences(manifest, pkg.directory, true)) {
    const key = `${reference.field}.${reference.alias}`
    const name = references.get(pkg.name)?.get(key) ?? reference.name
    const dependency = report.packages.find(candidate => candidate.name === name)
    if (reference.protocol !== 'registry' || reference.range.startsWith('catalog:')) {
      throw new Error(`Packed snapshot dependency is not publishable: ${pkg.name} ${reference.alias}.`)
    }
    if (!dependency) {
      continue
    }
    if (reference.name !== name || !validRange(reference.range) || !satisfies(dependency.version, reference.range)) {
      throw new Error(`Packed snapshot dependency changed before finalization: ${pkg.name} ${reference.alias}.`)
    }
    const locator = target.provider === 'pkg-pr-new' && reference.field !== 'peerDependencies'
      ? `https://pkg.pr.new/${target.repository}/${name}@${report.identity.commit}`
      : reference.alias === name ? dependency.version : `npm:${name}@${dependency.version}`
    const values = manifest[reference.field as keyof PackedManifest] as Record<string, string>
    values[reference.alias] = locator
    expected.set(key, { name, locator })
  }
  for (const key of references.get(pkg.name)?.keys() ?? []) {
    if (!expected.has(key)) {
      throw new Error(`Packed snapshot dependency was removed before finalization: ${pkg.name} ${key}.`)
    }
  }
  entry.data = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
  return { bytes: writeSnapshotArchive(entries), expected }
}
