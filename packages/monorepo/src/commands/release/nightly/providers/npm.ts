import type { SnapshotIdentity } from '../../snapshot/types'
import type { NightlyOptions, NightlyReport } from '../types'
import { setTimeout } from 'node:timers/promises'
import { matchesSnapshotMetadata, snapshotIdentity } from '../../snapshot/identity'

const registry = 'https://registry.npmjs.org/'
const tag = 'snapshot-nightly'
interface RegistryMetadata {
  name: string
  version: string
  repoctlSnapshot?: unknown
  dist?: { integrity?: string }
}
interface Publication { latest: string | null, version: string | null, metadata: RegistryMetadata | null }

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function createNightlyRegistry(options: NightlyOptions) {
  async function request(pathname: string, deadline = Number.POSITIVE_INFINITY) {
    const timeout = Math.min(10_000, deadline - Date.now())
    if (timeout <= 0) {
      throw new Error('Nightly registry confirmation timed out.')
    }
    let response: Response
    try {
      response = await (options.registryFetch ?? fetch)(new URL(pathname, registry), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(Math.max(1, Math.floor(timeout))) })
    }
    catch {
      throw new Error(`Nightly registry request failed for ${pathname}; publication state is unknown.`)
    }
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      throw new Error(`Nightly registry returned HTTP ${response.status} for ${pathname}; publication state is unknown.`)
    }
    const value: unknown = await response.json().catch(() => null)
    if (!object(value)) {
      throw new Error(`Nightly registry returned invalid metadata for ${pathname}.`)
    }
    return value
  }
  return {
    async publication(name: string, allowMissingVersion = false, deadline?: number): Promise<Publication> {
      const tags = await request(`-/package/${encodeURIComponent(name)}/dist-tags`, deadline)
      if (tags && Object.values(tags).some(value => typeof value !== 'string' || !value)) {
        throw new Error(`Nightly registry returned invalid dist-tags for ${name}.`)
      }
      const version = tags?.[tag] as string | undefined
      const metadata = version ? await request(`${encodeURIComponent(name)}/${encodeURIComponent(version)}`, deadline) : null
      if (version && !metadata && !allowMissingVersion) {
        throw new Error(`Nightly tag for ${name} points at unavailable metadata; publication state is unknown.`)
      }
      if (metadata && (metadata['name'] !== name || metadata['version'] !== version)) {
        throw new Error(`Nightly registry metadata does not match ${name}@${version}.`)
      }
      return { latest: tags?.['latest'] as string | undefined ?? null, version: version ?? null, metadata: metadata as RegistryMetadata | null }
    },
  }
}

function validPublishedIdentity(metadata: RegistryMetadata | null) {
  const value = metadata?.repoctlSnapshot
  if (!object(value) || Object.keys(value).sort().join(',') !== 'buildId,commit,identityKey,kind,tag'
    || value['kind'] !== 'nightly' || value['tag'] !== tag || typeof value['commit'] !== 'string'
    || typeof value['buildId'] !== 'string' || !/^sha512-[\w+/]{86}==$/.test(metadata?.dist?.integrity ?? '')) {
    return null
  }
  const identity: SnapshotIdentity = { kind: 'nightly', commit: value['commit'], buildId: value['buildId'] }
  try {
    const { key } = snapshotIdentity({ cwd: '', identity })
    return value['identityKey'] === key && metadata?.version.endsWith(`-snapshot.nightly.c${identity.commit}.b${key}`) ? { ...identity, key } : null
  }
  catch {
    return null
  }
}

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
    sharedIdentity ??= identity.key
    if (identity.key !== sharedIdentity) {
      complete = false
    }
  }
  return complete
}

export async function confirmNpmNightly(report: NightlyReport, options: NightlyOptions) {
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
    }
    if (!pending.length) {
      report.confirmed = true
      return
    }
    if (Date.now() >= deadline || attempt === 179) {
      throw new Error(`Nightly tags did not become visible: ${pending.join(', ')}.`)
    }
    await (options.sleep ?? setTimeout)(Math.min(5000, Math.max(0, deadline - Date.now())))
  }
}
