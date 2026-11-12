import type { SnapshotIdentity } from '../../../snapshot/types'
import type { RegistryMetadata } from './registry'
import { valid } from 'semver'
import { snapshotIdentity } from '../../../snapshot/identity'
import { parseDateNightlyVersion } from '../../versioning/date'
import { nightlyTag, registryObject } from './registry'

/** Naming is independent of identity; both formats require the same immutable evidence. */
export function validPublishedIdentity(metadata: RegistryMetadata | null) {
  const value = metadata?.repoctlSnapshot
  if (!registryObject(value) || Object.keys(value).sort().join(',') !== 'buildId,commit,identityKey,kind,tag'
    || value['kind'] !== 'nightly' || value['tag'] !== nightlyTag || typeof value['commit'] !== 'string'
    || typeof value['buildId'] !== 'string' || !/^sha512-[\w+/]{86}==$/.test(metadata?.dist?.integrity ?? '')) {
    return null
  }
  const identity: SnapshotIdentity = { kind: 'nightly', commit: value['commit'], buildId: value['buildId'] }
  try {
    const { key } = snapshotIdentity({ cwd: '', identity })
    if (value['identityKey'] !== key || !metadata || !valid(metadata.version)) {
      return null
    }
    const daily = parseDateNightlyVersion(metadata.version)
    const legacy = metadata.version.endsWith(`-snapshot.nightly.c${identity.commit}.b${key}`)
    return daily || legacy ? { ...identity, key, batch: daily ? `date:${daily.date}.${daily.sequence}` : 'snapshot' } : null
  }
  catch {
    return null
  }
}
