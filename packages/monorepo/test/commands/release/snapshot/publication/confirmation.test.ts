import { expect, it, vi } from 'vitest'
import { publishSnapshotArtifacts } from '../../../../../src/commands/release/snapshot/publish'
import { registryPresence } from '../../../../../src/commands/release/snapshot/publish/registry'
import { publicationFixture } from './fixture'

it('waits for full metadata after CLI version visibility without uploading accepted packages again', async () => {
  const h = await publicationFixture()
  let missing = 2
  h.lookup.mockImplementation((pkg, fields) => {
    if (!h.uploaded.has(pkg.name) || (pkg.name === 'first' && fields === 'manifest' && missing-- > 0)) {
      return undefined
    }
    return h.metadata(pkg)
  })
  const checkpoint = vi.fn(async () => {})
  await publishSnapshotArtifacts(h.report, h.options, checkpoint)
  expect(h.report.status).toBe('published')
  expect(h.report.packages.every(pkg => pkg.published)).toBe(true)
  expect(h.uploads).toEqual(['first', 'second'])
  expect(h.waits).toEqual([2_000, 2_000])
  expect(checkpoint).toHaveBeenCalledTimes(3)
  const manifests = h.spawn.mock.calls.filter(([command, args]) => command === 'npm' && args.includes('--json'))
  expect(manifests.every(([, args]) => args.includes('--prefer-online'))).toBe(true)
  expect(h.lookup.mock.calls.slice(0, 2).map(([pkg, fields]) => [pkg.name, fields])).toEqual([['first', 'manifest'], ['second', 'manifest']])
})

it('bounds missing metadata even with an immediate injected sleep and retains accepted upload evidence', async () => {
  const h = await publicationFixture()
  h.lookup.mockImplementation((pkg, fields) => h.uploaded.has(pkg.name) && fields === 'version' ? h.metadata(pkg) : undefined)
  await expect(publishSnapshotArtifacts(h.report, h.options, async () => {})).rejects.toThrow('metadata confirmation timed out')
  expect(h.uploads).toEqual(['first'])
  expect(h.waits).toHaveLength(3)
  expect(h.waits.reduce((sum, wait) => sum + wait, 0)).toBeLessThanOrEqual(6_000)
  expect(h.lookup.mock.calls.length).toBeLessThanOrEqual(6)
  expect(h.report.packages[0]?.published).toBe(false)
  expect(await h.progress()).toMatchObject({ acceptedPackages: [{ name: 'first', version: h.report.packages[0]!.version }] })
})

it.each(['E401 unauthorized', 'ENOTFOUND network failure'])('stops on %s after upload instead of treating unknown state as absence', async (error) => {
  const h = await publicationFixture()
  h.lookup.mockImplementation((pkg, fields) => {
    if (!h.uploaded.has(pkg.name)) {
      return undefined
    }
    if (fields === 'manifest') {
      throw new Error(error)
    }
    return h.metadata(pkg)
  })
  await expect(publishSnapshotArtifacts(h.report, h.options, async () => {})).rejects.toThrow(error.startsWith('E401') ? 'authentication failed' : 'registry state is unknown')
  expect(h.uploads).toEqual(['first'])
  expect(h.lookup.mock.calls.filter(([pkg, fields]) => pkg.name === 'first' && fields === 'manifest').length).toBeLessThanOrEqual(4)
  expect(h.waits).toEqual(error.startsWith('E401') ? [] : [1_000, 2_000])
})

it.each(['identity', 'integrity', 'name', 'version'])('rejects conflicting %s evidence without any additional upload', async (field) => {
  const h = await publicationFixture()
  h.lookup.mockImplementation((pkg, fields) => {
    if (!h.uploaded.has(pkg.name)) {
      return undefined
    }
    const metadata = h.metadata(pkg)
    if (fields === 'version') {
      return metadata
    }
    return field === 'identity'
      ? { ...metadata, repoctlSnapshot: { ...metadata.repoctlSnapshot, commit: 'b'.repeat(40) } }
      : field === 'integrity'
        ? { ...metadata, dist: { integrity: 'sha512-wrong' } }
        : { ...metadata, [field]: 'different' }
  })
  await expect(publishSnapshotArtifacts(h.report, h.options, async () => {})).rejects.toThrow(field === 'version' ? 'invalid metadata' : 'conflicts')
  expect(h.uploads).toEqual(['first'])
  expect(h.waits).toEqual([])
})

it('preflights every candidate before upload and caches only successful full CLI metadata', async () => {
  const h = await publicationFixture()
  h.lookup.mockImplementation(pkg => pkg.name === 'second' ? { ...h.metadata(pkg), dist: { integrity: 'sha512-wrong' } } : undefined)
  await expect(publishSnapshotArtifacts(h.report, h.options, async () => {})).rejects.toThrow('conflicts')
  expect(h.uploads).toEqual([])
  h.lookup.mockImplementation(pkg => h.metadata(pkg))
  const pkg = h.report.packages[0]!
  await expect(registryPresence(pkg, h.report, h.options)).resolves.toBe(true)
  h.lookup.mockImplementation(() => undefined)
  await expect(registryPresence(pkg, h.report, h.options)).resolves.toBe(true)
})
