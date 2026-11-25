import type { NightlyOptions, NightlyReport } from '../../types'
import type { RegistryMetadata } from './registry'
import { setTimeout } from 'node:timers/promises'
import { matchesSnapshotMetadata } from '../../../snapshot/identity'
import { validPublishedIdentity } from './identity'
import { createNightlyRegistry, nightlyTag } from './registry'

export { createNightlyRegistry } from './registry'

/** Freeze latest before upload and skip only a complete channel sharing one build. */
export async function inspectNpmNightly(report: NightlyReport, options: NightlyOptions) {
  const client = createNightlyRegistry(options)
  report.latest = {}
  let sharedIdentity: string | undefined
  let complete = true
  for (const pkg of report.packages) {
    const publication = await client.publication(pkg.name)
    report.latest[pkg.name] = publication.latest
    const identity = validPublishedIdentity(publication.metadata)
    if (!identity || identity.commit !== report.commit) {
      complete = false
      continue
    }
    const batch = `${identity.key}:${identity.batch}`
    sharedIdentity ??= batch
    if (batch !== sharedIdentity) {
      complete = false
    }
  }
  return complete
}

export async function confirmNpmNightly(report: NightlyReport, options: NightlyOptions, allowPending = true) {
  const snapshot = report.snapshot!
  const client = createNightlyRegistry(options)
  const deadline = Date.now() + 900_000
  for (let attempt = 0; attempt < 180; attempt++) {
    const pending: string[] = []
    for (const pkg of snapshot.packages) {
      const publication = await client.publication(pkg.name, true, deadline)
      if (publication.latest !== report.latest?.[pkg.name]) {
        throw new Error(`The latest tag changed for ${pkg.name}; nightly confirmation stopped.`)
      }
      if (publication.version !== pkg.version || !publication.metadata) {
        pending.push(pkg.name)
        continue
      }
      if (publication.metadata.dist?.integrity !== pkg.integrity || !validPublishedIdentity(publication.metadata)
        || !matchesSnapshotMetadata(publication.metadata.repoctlSnapshot, snapshot)) {
        throw new Error(`Nightly registry evidence conflicts with the published artifact for ${pkg.name}.`)
      }
      for (const accept of ['application/json; q=1.0, */*', 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*']) {
        const installation = await client.installation(pkg.name, deadline, accept) as {
          'versions'?: Record<string, RegistryMetadata | undefined>
          'dist-tags'?: Record<string, string | undefined>
        } | null
        const manifest = installation?.versions?.[pkg.version]
        const manifestDist = manifest?.dist
        if (manifest && (manifest.name !== pkg.name || manifest.version !== pkg.version
          || !manifestDist || manifestDist.integrity !== pkg.integrity || typeof manifestDist.tarball !== 'string'
          || !manifestDist.tarball || manifestDist.tarball !== publication.metadata.dist?.tarball
          || (accept.startsWith('application/json;') && !matchesSnapshotMetadata(manifest.repoctlSnapshot, snapshot)))) {
          throw new Error(`Nightly installation metadata conflicts with the published artifact for ${pkg.name} (${accept}).`)
        }
        if (installation?.['dist-tags']?.[nightlyTag] !== pkg.version || !manifest) {
          pending.push(`${pkg.name} (${accept})`)
        }
      }
    }
    if (!pending.length) {
      report.confirmed = true
      return
    }
    if (!allowPending) {
      throw new Error(`Nightly channel changed after consumer verification: ${pending.join(', ')}.`)
    }
    if (Date.now() >= deadline || attempt === 179) {
      throw new Error(`Nightly tags did not become visible: ${pending.join(', ')}.`)
    }
    await (options.sleep ?? setTimeout)(Math.min(5000, Math.max(0, deadline - Date.now())))
  }
}
