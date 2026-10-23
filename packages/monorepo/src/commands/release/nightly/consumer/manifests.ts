import type { PackedManifest } from '../../../package-check/types'
import type { NightlyReport } from '../types'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createPackageFromTarballData } from '@arethetypeswrong/core'
import { matchesSnapshotMetadata } from '../../snapshot/identity'

/** Derive the consumer contract from the checked artifacts, never mutable source manifests. */
export async function nightlyConsumerManifests(report: NightlyReport): Promise<PackedManifest[]> {
  const snapshot = report.snapshot
  if (!snapshot) {
    throw new Error('Nightly consumer requires a checked snapshot.')
  }
  return Promise.all(snapshot.packages.map(async (pkg) => {
    if (!pkg.tarball) {
      throw new Error(`Nightly consumer has no checked tarball for ${pkg.name}.`)
    }
    const bytes = await readFile(pkg.tarball)
    if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== pkg.integrity) {
      throw new Error(`Nightly consumer tarball integrity changed for ${pkg.name}.`)
    }
    const packed = createPackageFromTarballData(Uint8Array.from(bytes))
    const manifest = JSON.parse(packed.readFile(`/node_modules/${pkg.name}/package.json`)!) as PackedManifest & { repoctlSnapshot?: unknown }
    if (manifest.name !== pkg.name || manifest.version !== pkg.version || !matchesSnapshotMetadata(manifest.repoctlSnapshot, snapshot)) {
      throw new Error(`Nightly consumer tarball identity changed for ${pkg.name}.`)
    }
    return manifest
  }))
}
