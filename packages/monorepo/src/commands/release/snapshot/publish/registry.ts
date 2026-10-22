import type { ReleaseOptions } from '../../types'
import type { SnapshotOptions, SnapshotPackage, SnapshotReport } from '../types'
import { performance } from 'node:perf_hooks'
import { registryClient, sleep } from '../../registry'
import { registrySettings } from '../../registry/settings'
import { matchesSnapshotMetadata } from '../identity'

export type SnapshotPublicationOptions = SnapshotOptions & Pick<ReleaseOptions, 'config' | 'registryFetch'>

export async function registryPresence(pkg: SnapshotPackage, report: SnapshotReport, options: SnapshotPublicationOptions, deadline?: number) {
  const settings = registrySettings(options)
  const metadata = await registryClient(options).inspect(pkg, deadline ?? performance.now() + Math.min(settings.visibilityTimeoutMs, settings.requestTimeoutMs * 3 + 3_000), 'manifest')
  if (!metadata) {
    return false
  }
  if (metadata.name !== pkg.name || metadata.dist?.integrity !== pkg.integrity
    || !matchesSnapshotMetadata(metadata.repoctlSnapshot, report)) {
    throw new Error(`Snapshot identity or tarball integrity already conflicts at ${pkg.name}@${pkg.version}. Use a new buildId for a changed build.`)
  }
  return true
}

/** Only absence may lag an accepted upload; unknown state and conflicts fail closed. */
export async function confirmSnapshotPublication(pkg: SnapshotPackage, report: SnapshotReport, options: SnapshotPublicationOptions) {
  const budget = registrySettings(options).visibilityTimeoutMs
  const started = performance.now()
  let virtualWait = 0
  const remaining = () => Math.max(0, budget - (performance.now() - started + virtualWait))
  while (remaining() > 0) {
    if (await registryPresence(pkg, report, options, performance.now() + remaining())) {
      return
    }
    const wait = Math.min(2_000, remaining())
    if (wait) {
      const before = performance.now()
      await sleep(wait, options)
      virtualWait += Math.max(0, wait - (performance.now() - before))
    }
  }
  throw new Error(`Published snapshot metadata confirmation timed out for ${pkg.name}@${pkg.version}; the accepted upload was not repeated.`)
}
