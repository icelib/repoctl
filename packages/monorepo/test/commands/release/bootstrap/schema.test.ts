import { Buffer } from 'node:buffer'
import { expect, it } from 'vitest'
import { matchBootstrapRequest, validateBootstrapArchive, validateBootstrapManifest, validateBootstrapTag } from '../../../../src/commands/release/bootstrap/schema'
import { boundaryFixture, integrity, packBoundary } from './boundary-fixture'

it('accepts checked native package bytes and metadata without executing their public entry', async () => {
  const h = boundaryFixture()
  expect(validateBootstrapManifest(h.manifest)).toBe(h.manifest)
  await expect(validateBootstrapArchive(h.manifest, h.bytes)).resolves.toBeDefined()
  expect(() => matchBootstrapRequest(h.manifest, h.options)).not.toThrow()
})

it.each(['alpha', 'alpha.1', 'preview-next'])('accepts the same preview tag syntax in preparation and the portable manifest: %s', (tag) => {
  const h = boundaryFixture()
  h.manifest.tag = tag
  h.packedManifest.publishConfig['tag'] = tag
  expect(validateBootstrapTag(tag)).toBe(tag)
  expect(validateBootstrapManifest(h.manifest).tag).toBe(tag)
})

it.each(['', '1.0.0', '^1', 'snapshot-nightly', 'snapshot-pr-42', 'alpha/other', 'alpha\nlatest'])('rejects an invalid or reserved preview tag: %j', (tag) => {
  expect(() => validateBootstrapTag(tag)).toThrow()
})

it.each(['package', 'version', 'tag'])('rejects dispatch inputs that select another %s', (field) => {
  const h = boundaryFixture()
  const options = { ...h.options }
  if (field === 'package') {
    options.packageName = '@acme/other'
  }
  if (field === 'version') {
    options.version = '0.1.0-alpha.1'
  }
  if (field === 'tag') {
    options.tag = 'beta'
  }
  expect(() => matchBootstrapRequest(h.manifest, options)).toThrow('dispatch input')
})

it.each(['stable-version', 'protected-tag', 'failed-check', 'missing-files', 'changed-entry'])('rejects substituted checked metadata: %s', (kind) => {
  const h = boundaryFixture()
  if (kind === 'stable-version') {
    h.manifest.package.version = '0.1.0'
  }
  if (kind === 'protected-tag') {
    h.manifest.tag = 'legacy-1'
    h.packedManifest.publishConfig['tag'] = 'legacy-1'
  }
  if (kind === 'failed-check') {
    h.manifest.checks.package.status = 'failed'
  }
  if (kind === 'missing-files') {
    h.manifest.checks.package.files = ['package.json']
  }
  if (kind === 'changed-entry') {
    h.manifest.entries[0]!.target = './unchecked.js'
  }
  expect(() => validateBootstrapManifest(h.manifest)).toThrow()
})

it.each([
  { label: 'registry', patch: { registry: 'https://example.invalid/' } },
  { label: 'tag', patch: { tag: 'latest' } },
  { label: 'access', patch: { access: 'restricted' } },
  { label: 'directory', patch: { directory: '../unchecked' } },
  { label: 'provenance', patch: { provenance: false } },
])('rejects packed publication overrides: $label', ({ patch }) => {
  const h = boundaryFixture()
  Object.assign(h.packedManifest.publishConfig, patch)
  expect(() => validateBootstrapManifest(h.manifest)).toThrow()
})

it.each([
  { label: 'private package', patch: { private: true } },
  { label: 'local dependency', patch: { dependencies: { shared: 'file:../shared' } } },
  { label: 'workspace peer', patch: { peerDependencies: { shared: 'workspace:*' } } },
  { label: 'unresolved registry tag', patch: { optionalDependencies: { shared: 'latest' } } },
])('rejects checked metadata that cannot be safely published: $label', ({ patch }) => {
  const h = boundaryFixture()
  Object.assign(h.packedManifest, patch)
  expect(() => validateBootstrapManifest(h.manifest)).toThrow()
})

it('rejects a replaced tarball before considering its declared package files', async () => {
  const h = boundaryFixture()
  await expect(validateBootstrapArchive(h.manifest, Buffer.from('substituted artifact'))).rejects.toThrow('integrity')
})

it('rejects an unchecked file inventory even when a replacement archive has a matching digest', async () => {
  const h = boundaryFixture()
  const bytes = packBoundary(h.packedManifest, [{ path: 'package/unchecked.js', mode: 0o644, type: 'File', data: Buffer.from('export const unchecked = true') }])
  h.manifest.package.integrity = integrity(bytes)
  await expect(validateBootstrapArchive(h.manifest, bytes)).rejects.toThrow('inventory')
})

it('rejects package metadata substitution despite unchanged filenames and a matching archive digest', async () => {
  const h = boundaryFixture()
  const bytes = packBoundary({ ...h.packedManifest, version: '0.1.0-alpha.9' })
  h.manifest.package.integrity = integrity(bytes)
  await expect(validateBootstrapArchive(h.manifest, bytes)).rejects.toThrow('Packed bootstrap manifest differs')
})

it.each([0o4644, 0o2644, 0o1644])('rejects unsafe archive permission bits %s even with a matching inventory and digest', async (mode) => {
  const h = boundaryFixture()
  const bytes = packBoundary(h.packedManifest, [{ path: 'package/privileged', mode, type: 'File', data: Buffer.from('not executed') }])
  h.manifest.package.integrity = integrity(bytes)
  h.manifest.package.files.push('privileged')
  h.manifest.checks.package.files.push('privileged')
  await expect(validateBootstrapArchive(h.manifest, bytes)).rejects.toThrow('permission')
})
