import type { ReleaseOptions } from '../../../types'
import type { SnapshotReport } from '../../types'
import { performance } from 'node:perf_hooks'
import { valid } from 'semver'
import { registryClient, sleep } from '../../../registry'
import { matchesSnapshotMetadata, snapshotIdentity } from '../../identity'

export async function readSnapshotTags(name: string, options: Pick<ReleaseOptions, 'registryFetch'>): Promise<Record<string, string>> {
  const response = await (options.registryFetch ?? globalThis.fetch)(`https://registry.npmjs.org/-/package/${encodeURIComponent(name)}/dist-tags`, {
    headers: { 'accept': 'application/json', 'cache-control': 'no-cache' },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404) {
    await response.body?.cancel()
    return {}
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Snapshot dist-tags are unknown for ${name}: HTTP ${response.status}.`)
  }
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(version => typeof version !== 'string' || !valid(version))) {
    throw new Error(`Invalid snapshot dist-tags for ${name}.`)
  }
  return value as Record<string, string>
}

export async function preflightSnapshotTags(report: SnapshotReport, options: ReleaseOptions) {
  const baseline = new Map<string, Record<string, string>>()
  const currentBuild = /^run-(\d+)-attempt-(\d+)$/u.exec(report.identity.buildId)!
  for (const pkg of report.packages) {
    const tags = await readSnapshotTags(pkg.name, options)
    baseline.set(pkg.name, tags)
    const target = tags[report.tag]
    if (pkg.published && target !== pkg.version) {
      throw new Error(`Published snapshot ${pkg.name}@${pkg.version} no longer owns ${report.tag}; use a new approved build.`)
    }
    if (!pkg.published && target === pkg.version) {
      throw new Error(`Snapshot tag for ${pkg.name} already identifies this version, but immutable metadata is unavailable; refusing to repeat an accepted upload.`)
    }
    if (!target || target === pkg.version) {
      continue
    }
    const metadata = await registryClient(options).inspect({ name: pkg.name, version: target }, performance.now() + 30_000, 'manifest')
    const previous = metadata?.repoctlSnapshot as Record<string, unknown> | undefined
    const previousBuild = typeof previous?.['buildId'] === 'string' ? /^run-(\d+)-attempt-(\d+)$/u.exec(previous['buildId']) : null
    let previousIdentity = false
    if (previous?.['kind'] === 'pr' && typeof previous['pullRequest'] === 'number' && typeof previous['commit'] === 'string' && typeof previous['buildId'] === 'string') {
      try {
        const { identity, key, tag } = snapshotIdentity({ cwd: '', identity: { kind: 'pr', pullRequest: previous['pullRequest'], commit: previous['commit'], buildId: previous['buildId'] } })
        previousIdentity = matchesSnapshotMetadata(previous, { ...report, identity, identityKey: key, tag })
          && target.endsWith(`-snapshot.pr.${identity.kind === 'pr' ? identity.pullRequest : ''}.c${identity.commit}.b${key}`)
          && /^sha512-[\w+/]{86}==$/.test(metadata?.dist?.integrity ?? '')
      }
      catch { /* A malformed previous identity must never be overwritten. */ }
    }
    if (metadata?.name !== pkg.name || previous?.['kind'] !== 'pr' || report.identity.kind !== 'pr'
      || previous['pullRequest'] !== report.identity.pullRequest || previous['tag'] !== report.tag || !previousBuild || !previousIdentity
      || BigInt(previousBuild[1]!) > BigInt(currentBuild[1]!)
      || (previousBuild[1] === currentBuild[1] && BigInt(previousBuild[2]!) >= BigInt(currentBuild[2]!))) {
      throw new Error(`Refusing to overwrite an unrelated or newer snapshot tag for ${pkg.name}.`)
    }
  }
  return baseline
}

export async function assertSnapshotTags(report: SnapshotReport, baseline: ReadonlyMap<string, Record<string, string>>, options: ReleaseOptions, confirmed = false) {
  for (const pkg of report.packages) {
    const current = await readSnapshotTags(pkg.name, options)
    const before = baseline.get(pkg.name)!
    if (current['latest'] !== before['latest']) {
      throw new Error(`The latest tag changed concurrently for ${pkg.name}; it was not restored or modified by snapshot publication.`)
    }
    const expected = pkg.published || confirmed ? pkg.version : before[report.tag]
    if (current[report.tag] !== expected) {
      throw new Error(`Snapshot tag changed or was not confirmed for ${pkg.name}; refusing to overwrite it.`)
    }
  }
}

export async function confirmSnapshotTag(name: string, version: string, tag: string, options: ReleaseOptions) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const tags = await readSnapshotTags(name, options)
    if (tags[tag] === version) {
      return
    }
    if (attempt < 19) {
      await sleep(2_000, options)
    }
  }
  throw new Error(`Snapshot tag confirmation timed out for ${name}@${version}; the accepted upload was not repeated.`)
}
