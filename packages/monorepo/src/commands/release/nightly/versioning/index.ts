import type { SnapshotReport } from '../../snapshot/types'
import type { NightlyOptions } from '../types'
import { matchesSnapshotMetadata } from '../../snapshot/identity'
import { snapshotInstallation } from '../../snapshot/install'
import { validPublishedIdentity } from '../providers/npm/identity'
import { createNightlyRegistry, registryObject } from '../providers/npm/registry'
import { nightlyBaseVersion, parseDateNightlyVersion } from './date'

/** Freeze one batch before building. Published versions reserve counters even if their tags moved. */
export async function planDateNightlyVersions(report: SnapshotReport, options: NightlyOptions) {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const registry = createNightlyRegistry(options)
  let maximum = 0
  let recovered: { date: string, sequence: number } | undefined
  for (const pkg of report.packages) {
    const versions = await registry.versions(pkg.name)
    for (const metadata of versions) {
      const daily = parseDateNightlyVersion(metadata.version)
      if (daily?.date === date) {
        maximum = Math.max(maximum, daily.sequence)
      }
      if (!registryObject(metadata.repoctlSnapshot) || metadata.repoctlSnapshot['identityKey'] !== report.identityKey) {
        continue
      }
      if (!daily || daily.base !== nightlyBaseVersion(pkg.version) || !validPublishedIdentity(metadata)
        || !matchesSnapshotMetadata(metadata.repoctlSnapshot, report)) {
        throw new Error(`Published nightly build identity conflicts at ${pkg.name}@${metadata.version}. Use a new run or attempt.`)
      }
      if (recovered && (recovered.date !== daily.date || recovered.sequence !== daily.sequence)) {
        throw new Error('Published nightly build identity spans conflicting dates or sequences. Use a new run or attempt.')
      }
      recovered = daily
    }
  }
  const batch = recovered ?? { date, sequence: maximum + 1 }
  if (!Number.isSafeInteger(batch.sequence)) {
    throw new TypeError('Nightly daily version sequence exceeds the safe integer limit.')
  }
  for (const pkg of report.packages) {
    pkg.version = `${nightlyBaseVersion(pkg.version)}-dev.${batch.date}.${batch.sequence}`
  }
  Object.assign(report, snapshotInstallation(report.packages, report.registry))
}
