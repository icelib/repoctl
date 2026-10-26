import type { PackedManifest } from '../../../package-check/types'
import type { PreparedSnapshotManifest, SnapshotBuildPackage, SnapshotBuildPlan } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { validRange } from 'semver'
import { dependencyReferences } from '../../../package-check/dependencies'
import { readSnapshotArchive, writeSnapshotArchive } from '../archive'
import { canonicalSnapshotJson, exactKeys, object, packageName, safeRelativePath, snapshotPlanDigest, validateSnapshotBuildPlan } from './schema'

function validatePackedManifest(value: unknown, pkg: SnapshotBuildPackage, plan: SnapshotBuildPlan) {
  const manifest = object(value)
  const publish = object(manifest['publishConfig'])
  if (Object.keys(publish).some(key => !['registry', 'tag', 'access', 'provenance'].includes(key))
    || publish['registry'] !== plan.registry || publish['tag'] !== plan.tag
    || (publish['access'] !== undefined && publish['access'] !== 'public')
    || (publish['provenance'] !== undefined && publish['provenance'] !== true)
    || manifest['name'] !== pkg.name || manifest['version'] !== pkg.version || manifest['private'] === true
    || canonicalSnapshotJson(manifest['repoctlSnapshot']) !== canonicalSnapshotJson({ ...plan.identity, identityKey: plan.identityKey, tag: plan.tag })) {
    throw new Error(`Prepared snapshot identity or publishConfig is invalid for ${pkg.name}.`)
  }
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    if (manifest[field] !== undefined && Object.entries(object(manifest[field])).some(([alias, range]) => !packageName(alias) || typeof range !== 'string')) {
      throw new Error(`Prepared snapshot dependency map is invalid for ${pkg.name}.`)
    }
  }
  const seen = new Set<string>()
  for (const reference of dependencyReferences(manifest as PackedManifest, '.', true)) {
    if (reference.protocol !== 'registry' || !packageName(reference.name) || !validRange(reference.range)) {
      throw new Error(`Prepared snapshot contains an unsupported dependency: ${pkg.name} ${reference.alias}.`)
    }
    const edge = pkg.dependencies.find(edge => edge.field === reference.field && edge.alias === reference.alias)
    const internal = plan.packages.some(candidate => candidate.name === reference.name)
    if (edge || internal) {
      const expected = edge && (edge.alias === edge.name ? edge.version : `npm:${edge.name}@${edge.version}`)
      const actual = (manifest[reference.field] as Record<string, string>)[reference.alias]
      if (!edge || reference.name !== edge.name || actual !== expected) {
        throw new Error(`Prepared snapshot dependency closure changed for ${pkg.name}: ${reference.alias}.`)
      }
      seen.add(`${edge.field}.${edge.alias}`)
    }
  }
  if (seen.size !== pkg.dependencies.length) {
    throw new Error(`Prepared snapshot dependency closure is incomplete for ${pkg.name}.`)
  }
}

/** Inspect data and bytes only. Never extract, load configuration, install or execute candidate code. */
export async function validatePreparedSnapshot(value: unknown, trustedPlan: SnapshotBuildPlan, files: ReadonlyMap<string, Uint8Array>): Promise<PreparedSnapshotManifest> {
  const plan = validateSnapshotBuildPlan(trustedPlan)
  const manifest = object(value)
  exactKeys(manifest, ['schemaVersion', 'plan', 'planDigest', 'packages', 'checks'])
  validateSnapshotBuildPlan(manifest['plan'])
  if (manifest['schemaVersion'] !== 1 || canonicalSnapshotJson(manifest['plan']) !== canonicalSnapshotJson(plan)
    || manifest['planDigest'] !== snapshotPlanDigest(plan) || !Array.isArray(manifest['packages']) || manifest['packages'].length !== plan.packages.length) {
    throw new Error('Prepared snapshot does not match the trusted frozen plan.')
  }
  const encoded = files.get('snapshot-manifest.json')
  if (!encoded || canonicalSnapshotJson(JSON.parse(new TextDecoder().decode(encoded))) !== canonicalSnapshotJson(manifest)) {
    throw new Error('Prepared snapshot manifest bytes do not match the supplied manifest.')
  }
  const checks = object(manifest['checks'])
  exactKeys(checks, ['build', 'packages'])
  if (checks['build'] !== 'passed' || !Array.isArray(checks['packages']) || checks['packages'].length !== plan.packages.length) {
    throw new Error('Prepared snapshot lacks successful build and package validation evidence.')
  }
  const expectedFiles = new Set(['snapshot-manifest.json'])
  for (const [index, pkg] of plan.packages.entries()) {
    const artifact = object(manifest['packages'][index])
    exactKeys(artifact, ['name', 'version', 'tarball', 'integrity'])
    const tarball = `tarballs/${index}/package.tgz`
    const bytes = files.get(tarball)
    if (artifact['name'] !== pkg.name || artifact['version'] !== pkg.version || artifact['tarball'] !== tarball
      || typeof artifact['integrity'] !== 'string' || !/^sha512-[\w+/]{86}==$/.test(artifact['integrity'])
      || !bytes || bytes.byteLength > 256 * 1024 * 1024
      || artifact['integrity'] !== `sha512-${createHash('sha512').update(bytes).digest('base64')}`) {
      throw new Error(`Prepared snapshot tarball identity or SHA512 differs for ${pkg.name}.`)
    }
    expectedFiles.add(tarball)
    // Bound decompression before parsing entries; a small compressed artifact can otherwise exhaust the publisher.
    const archive = gunzipSync(bytes, { maxOutputLength: 256 * 1024 * 1024 })
    const entries = await readSnapshotArchive(archive)
    // Compare the tar representation, allowing compatible zlib versions to encode gzip differently.
    if (Buffer.compare(archive, gunzipSync(writeSnapshotArchive(entries))) !== 0) {
      throw new Error(`Prepared snapshot tarball is not the canonical finalized archive for ${pkg.name}.`)
    }
    const packed = entries.find(entry => entry.path === 'package/package.json' && entry.type === 'File')
    if (!packed || entries.some(entry => entry.mode & 0o7000)) {
      throw new Error(`Prepared snapshot has missing package metadata or unsafe archive permissions: ${pkg.name}.`)
    }
    validatePackedManifest(JSON.parse(packed.data.toString('utf8')), pkg, plan)
    const check = object(checks['packages'][index])
    exactKeys(check, ['name', 'status', 'files'])
    const paths = entries.filter(entry => entry.type === 'File').map(entry => entry.path.slice('package/'.length)).sort()
    if (check['name'] !== pkg.name || check['status'] !== 'passed' || !Array.isArray(check['files'])
      || check['files'].some(file => !safeRelativePath(file)) || canonicalSnapshotJson([...check['files']].sort()) !== canonicalSnapshotJson(paths)) {
      throw new Error(`Prepared snapshot package validation evidence is incomplete for ${pkg.name}.`)
    }
  }
  if (files.size !== expectedFiles.size || [...files.keys()].some(file => !expectedFiles.has(file))) {
    throw new Error('Prepared snapshot bundle contains missing or unexpected files.')
  }
  return value as PreparedSnapshotManifest
}
