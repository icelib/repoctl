import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { canonicalSnapshotJson, snapshotPlanDigest, validateSnapshotBuildPlan } from '../../../../../src/commands/release/snapshot/prepared/schema'
import { validatePreparedSnapshot } from '../../../../../src/commands/release/snapshot/prepared/validate'
import { bundle } from './fixture'

it('validates a portable prepared bundle and its exact alias, optional, peer and dev dependency closure without executing it', async () => {
  const h = bundle()
  expect(await validatePreparedSnapshot(h.manifest, h.plan, h.files)).toBe(h.manifest)
  expect(snapshotPlanDigest(JSON.parse(canonicalSnapshotJson(h.plan)))).toBe(h.manifest.planDigest)
})

it('rejects trailing tar payload even when its declared SHA512 matches', async () => {
  const h = bundle()
  const pkg = h.manifest.packages[0]!
  const altered = gzipSync(Buffer.concat([gunzipSync(h.files.get(pkg.tarball)!), Buffer.from('unparsed trailing payload')]))
  h.files.set(pkg.tarball, altered)
  pkg.integrity = `sha512-${createHash('sha512').update(altered).digest('base64')}`
  h.encodeManifest()
  await expect(validatePreparedSnapshot(h.manifest, h.plan, h.files)).rejects.toThrow('canonical finalized archive')
})

it.each(['schema', 'unknown-field', 'duplicate-package', 'path', 'identity', 'version', 'tag', 'registry', 'package-manager', 'dependency'])('rejects malformed frozen plan: %s', (kind) => {
  const h = bundle()
  const plan = structuredClone(h.plan) as any
  if (kind === 'schema') {
    plan.schemaVersion = 2
  }
  if (kind === 'unknown-field') {
    plan.execute = 'node evil.js'
  }
  if (kind === 'duplicate-package') {
    plan.packages.push(plan.packages[0])
  }
  if (kind === 'path') {
    plan.packages[0].directory = '../outside'
  }
  if (kind === 'identity') {
    plan.identity.commit = 'f'.repeat(40)
  }
  if (kind === 'version') {
    plan.packages[0].version = '1.0.0'
  }
  if (kind === 'tag') {
    plan.tag = 'latest'
  }
  if (kind === 'registry') {
    plan.registry = 'https://example.invalid/'
  }
  if (kind === 'package-manager') {
    plan.packageManager = 'pnpm@latest'
  }
  if (kind === 'dependency') {
    plan.packages[1].dependencies[0].version = '1.0.0'
  }
  expect(() => validateSnapshotBuildPlan(plan)).toThrow()
})

it.each(['bytes', 'extra-file', 'missing-file', 'duplicate-package', 'plan', 'digest', 'checks', 'manifest-bytes'])('rejects tampered prepared bundle: %s', async (kind) => {
  const h = bundle()
  if (kind === 'bytes') {
    h.files.set(h.manifest.packages[0]!.tarball, Buffer.from('tampered'))
  }
  if (kind === 'extra-file') {
    h.files.set('run.js', Buffer.from('malicious code'))
  }
  if (kind === 'missing-file') {
    h.files.delete(h.manifest.packages[0]!.tarball)
  }
  if (kind === 'duplicate-package') {
    h.manifest.packages[1] = h.manifest.packages[0]!
  }
  if (kind === 'plan') {
    h.manifest.plan.packages[0]!.reasons = ['altered']
  }
  if (kind === 'digest') {
    h.manifest.planDigest = `sha256-${'0'.repeat(64)}`
  }
  if (kind === 'checks') {
    h.manifest.checks.packages[0]!.files = ['package.json']
  }
  h.encodeManifest()
  if (kind === 'manifest-bytes') {
    h.files.set('snapshot-manifest.json', Buffer.from('{}'))
  }
  await expect(validatePreparedSnapshot(h.manifest, h.plan, h.files)).rejects.toThrow()
})

it.each(['name', 'version', 'identity', 'directory', 'registry', 'tag', 'access', 'provenance', 'extra-config', 'dependency-range', 'dependency-name', 'missing-edge', 'extra-edge', 'local-edge'])('rejects repacked metadata despite a matching new SHA512: %s', async (kind) => {
  const h = bundle()
  const pkg = structuredClone(h.manifests[1]) as any
  if (kind === 'name') {
    pkg.name = '@scope/unapproved'
  }
  if (kind === 'version') {
    pkg.version = '1.0.0'
  }
  if (kind === 'identity') {
    pkg.repoctlSnapshot.commit = 'f'.repeat(40)
  }
  if (kind === 'directory') {
    pkg.publishConfig.directory = '../outside'
  }
  if (kind === 'registry') {
    pkg.publishConfig.registry = 'https://example.invalid/'
  }
  if (kind === 'tag') {
    pkg.publishConfig.tag = 'latest'
  }
  if (kind === 'access') {
    pkg.publishConfig.access = 'restricted'
  }
  if (kind === 'provenance') {
    pkg.publishConfig.provenance = false
  }
  if (kind === 'extra-config') {
    pkg.publishConfig.executable = true
  }
  if (kind === 'dependency-range') {
    pkg.dependencies.alias = `npm:@scope/a@^${h.plan.packages[0]!.version}`
  }
  if (kind === 'dependency-name') {
    pkg.dependencies.alias = `npm:@scope/other@${h.plan.packages[0]!.version}`
  }
  if (kind === 'missing-edge') {
    delete pkg.dependencies.alias
  }
  if (kind === 'extra-edge') {
    pkg.dependencies.extra = `npm:@scope/a@${h.plan.packages[0]!.version}`
  }
  if (kind === 'local-edge') {
    pkg.dependencies.extra = 'file:../elsewhere'
  }
  h.pack(1, pkg)
  await expect(validatePreparedSnapshot(h.manifest, h.plan, h.files)).rejects.toThrow()
})
