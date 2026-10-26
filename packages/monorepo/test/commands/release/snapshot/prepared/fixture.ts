import type { PreparedSnapshotManifest, SnapshotBuildPlan, SnapshotSource } from '../../../../../src/commands/release/snapshot/prepared/types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { writeSnapshotArchive } from '../../../../../src/commands/release/snapshot/archive'
import { snapshotIdentity } from '../../../../../src/commands/release/snapshot/identity'
import { snapshotPlanDigest } from '../../../../../src/commands/release/snapshot/prepared/schema'

export function source(commit = 'a'.repeat(40)): SnapshotSource {
  return { repository: 'acme/repo', repositoryId: 12, pullRequest: 42, headSha: 'b'.repeat(40), baseSha: 'c'.repeat(40), baseRef: 'main', mergeSha: commit, runId: 123, runAttempt: 2, workflowId: 456, workflowPath: '.github/workflows/snapshot-build.yml', workflowSha: 'd'.repeat(40), defaultBranch: 'main' }
}

export function bundle() {
  const frozen = source()
  const identity = { kind: 'pr' as const, pullRequest: frozen.pullRequest, commit: frozen.mergeSha, buildId: `run-${frozen.runId}-attempt-${frozen.runAttempt}` }
  const { key, tag } = snapshotIdentity({ cwd: '', identity })
  const version = `1.0.1-snapshot.pr.${frozen.pullRequest}.c${frozen.mergeSha}.b${key}`
  const plan: SnapshotBuildPlan = {
    schemaVersion: 1,
    source: frozen,
    identity,
    identityKey: key,
    tag,
    registry: 'https://registry.npmjs.org/',
    packageManager: 'pnpm@12.14.0',
    packages: [
      { name: '@scope/a', directory: 'packages/a', currentVersion: '1.0.0', version, reasons: ['intent'], dependencies: [] },
      { name: '@scope/b', directory: 'packages/b', currentVersion: '1.0.0', version, reasons: ['dependency'], dependencies: [
        { field: 'dependencies', alias: 'alias', name: '@scope/a', version },
        { field: 'optionalDependencies', alias: '@scope/a', name: '@scope/a', version },
        { field: 'peerDependencies', alias: '@scope/a', name: '@scope/a', version },
        { field: 'devDependencies', alias: '@scope/a', name: '@scope/a', version },
      ] },
    ],
  }
  const files = new Map<string, Uint8Array>()
  const manifest: PreparedSnapshotManifest = {
    schemaVersion: 1,
    plan: structuredClone(plan),
    planDigest: snapshotPlanDigest(plan),
    packages: plan.packages.map((pkg, index) => ({ name: pkg.name, version: pkg.version, tarball: `tarballs/${index}/package.tgz`, integrity: '' })),
    checks: { build: 'passed', packages: plan.packages.map(pkg => ({ name: pkg.name, status: 'passed', files: ['index.js', 'package.json'] })) },
  }
  const manifests = plan.packages.map(pkg => ({
    name: pkg.name,
    version: pkg.version,
    repoctlSnapshot: { ...identity, identityKey: key, tag },
    publishConfig: { registry: plan.registry, tag, access: 'public' },
    ...Object.fromEntries(['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'].map(field => [field, Object.fromEntries(pkg.dependencies.filter(edge => edge.field === field).map(edge => [edge.alias, edge.alias === edge.name ? edge.version : `npm:${edge.name}@${edge.version}`]))])),
  }))
  function encodeManifest() {
    files.set('snapshot-manifest.json', Buffer.from(JSON.stringify(manifest)))
  }
  function pack(index: number, value: unknown = manifests[index]) {
    const bytes = writeSnapshotArchive([
      { path: 'package/package.json', mode: 0o644, type: 'File', data: Buffer.from(JSON.stringify(value)) },
      { path: 'package/index.js', mode: 0o644, type: 'File', data: Buffer.from('throw new Error("Candidate code must never execute during validation")') },
    ])
    files.set(manifest.packages[index]!.tarball, bytes)
    manifest.packages[index]!.integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    encodeManifest()
  }
  manifests.forEach((_, index) => pack(index))
  return { plan, manifest, manifests, files, pack, encodeManifest }
}
