import type { PackedManifest } from '../../../../package-check/types'
import type { PreparedSnapshotManifest } from '../types'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'
import { matchesSnapshotMetadata } from '../../identity'
import { snapshotPublicationReport } from '../publish/context'
import { object } from '../schema'

/** Validate the entire installed batch before any candidate entrypoint can run. */
export async function installedSnapshotPackages(manifest: PreparedSnapshotManifest, directory: string, applicable?: ReadonlySet<string>) {
  const lock = object(parse(await readFile(path.join(directory, 'pnpm-lock.yaml'), 'utf8')))
  const packages = object(lock['packages'])
  const snapshot = snapshotPublicationReport(manifest, directory)
  const validated: Array<{ packed: PackedManifest, installed: string }> = []
  for (const pkg of manifest.packages) {
    if (applicable && !applicable.has(pkg.name)) {
      continue
    }
    const resolution = object(object(packages[`${pkg.name}@${pkg.version}`])['resolution'])
    if (resolution['integrity'] !== pkg.integrity) {
      throw new Error(`Snapshot consumer installation did not retain the verified integrity for ${pkg.name}.`)
    }
    const installed = await realpath(path.join(directory, 'node_modules', pkg.name))
    const relative = path.relative(directory, installed)
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Snapshot consumer resolved ${pkg.name} outside its isolated directory.`)
    }
    const packed = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8')) as PackedManifest & { repoctlSnapshot?: unknown }
    if (packed.name !== pkg.name || packed.version !== pkg.version || !matchesSnapshotMetadata(packed.repoctlSnapshot, snapshot)) {
      throw new Error(`Snapshot consumer installed unexpected identity for ${pkg.name}.`)
    }
    validated.push({ packed, installed })
  }
  return validated
}
