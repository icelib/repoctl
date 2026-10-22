import { expect, it, vi } from 'vitest'
import { confirmNpmNightly, createNightlyRegistry, inspectNpmNightly } from '../../../../src/commands/release/nightly/providers/npm'
import { json, npmFetch, npmMetadata } from './fixture'
import { reportFixture } from './provider-fixture'

it('freezes latest and requires all npm tags to share the current commit and one build identity', async () => {
  const report = reportFixture()
  expect(await inspectNpmNightly(report, { cwd: '.', registryFetch: npmFetch(report) })).toBe(true)
  expect(report.latest).toEqual({ '@scope/a': '1.0.0', 'b': '1.0.0' })
  expect(await inspectNpmNightly(report, { cwd: '.', registryFetch: npmFetch(report, (name, metadata) => name === 'b' ? { ...metadata, repoctlSnapshot: { ...metadata.repoctlSnapshot, commit: 'b'.repeat(40) } } : metadata) })).toBe(false)
  expect(await inspectNpmNightly(report, { cwd: '.', registryFetch: npmFetch(report, (name, metadata) => name === 'b' ? null : metadata) })).toBe(false)
  const previous = reportFixture('npm', 'previous-successful-build')
  expect(await inspectNpmNightly(report, { cwd: '.', registryFetch: npmFetch(previous) })).toBe(true)
  expect(await inspectNpmNightly(report, { cwd: '.', registryFetch: npmFetch(report, (name, metadata) => name === 'b' ? npmMetadata(previous, name) : metadata) })).toBe(false)
})

it.each(['extra metadata', 'invalid identity', 'invalid integrity', 'wrong version'])('does not skip an ambiguous nightly channel: %s', async (reason) => {
  const report = reportFixture()
  const registryFetch = npmFetch(report, (_name, metadata) => {
    if (reason === 'extra metadata') {
      return { ...metadata, repoctlSnapshot: { ...metadata.repoctlSnapshot, extra: true } }
    }
    if (reason === 'invalid identity') {
      return { ...metadata, repoctlSnapshot: { ...metadata.repoctlSnapshot, identityKey: 'invalid' } }
    }
    if (reason === 'invalid integrity') {
      return { ...metadata, dist: { integrity: 'sha1-legacy' } }
    }
    return { ...metadata, version: '1.0.0' }
  })
  expect(await inspectNpmNightly(report, { cwd: '.', registryFetch })).toBe(false)
})

it('distinguishes absent npm packages from broken tags, query failures and malformed metadata', async () => {
  const report = reportFixture()
  const missing = createNightlyRegistry({ cwd: '.', registryFetch: vi.fn(async () => json({}, 404)) })
  expect(await missing.publication('missing')).toEqual({ latest: null, version: null, metadata: null })
  const broken = createNightlyRegistry({ cwd: '.', registryFetch: vi.fn<typeof fetch>(async input => String(input).includes('dist-tags') ? json({ 'snapshot-nightly': '1.0.0' }) : json({}, 404)) })
  await expect(broken.publication('b')).rejects.toThrow('unavailable metadata')
  const malformed = createNightlyRegistry({ cwd: '.', registryFetch: vi.fn(async () => json([])) })
  await expect(malformed.publication('b')).rejects.toThrow('invalid metadata')
  const network = createNightlyRegistry({ cwd: '.', registryFetch: vi.fn(async () => {
    throw new Error('secret must not appear')
  }) })
  await expect(network.publication('b')).rejects.toThrow('publication state is unknown')
  const mismatch = createNightlyRegistry({ cwd: '.', registryFetch: npmFetch(report, (_name, metadata) => ({ ...metadata, name: 'different' })) })
  await expect(mismatch.publication('b')).rejects.toThrow('does not match')
})

it('confirms exact versions, metadata and integrity without changing latest', async () => {
  const report = reportFixture()
  const options = { cwd: '.', registryFetch: npmFetch(report) }
  await inspectNpmNightly(report, options)
  await confirmNpmNightly(report, options)
  expect(report.confirmed).toBe(true)
  const metadata = npmMetadata(report, 'b')
  await expect(confirmNpmNightly(report, { cwd: '.', registryFetch: npmFetch(report, (name, value) => name === 'b' ? { ...metadata, dist: { integrity: 'sha512-wrong' } } : value) })).rejects.toThrow('conflicts with the published artifact')
  report.latest!['b'] = 'changed'
  await expect(confirmNpmNightly(report, options)).rejects.toThrow('latest tag changed')
})

it('waits for a newly published tag and fails when propagation never completes', async () => {
  const report = reportFixture()
  report.latest = { '@scope/a': '1.0.0', 'b': '1.0.0' }
  const complete = npmFetch(report)
  const sleep = vi.fn(async () => {})
  let queries = 0
  const registryFetch = vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).includes('dist-tags') && queries++ === 0) {
      return json({ latest: '1.0.0' })
    }
    return complete(input, init)
  })
  await confirmNpmNightly(report, { cwd: '.', registryFetch, sleep })
  expect(sleep).toHaveBeenCalledOnce()
  expect(report.confirmed).toBe(true)
  await expect(confirmNpmNightly(report, { cwd: '.', registryFetch: vi.fn(async () => json({ latest: '1.0.0' })), sleep })).rejects.toThrow('did not become visible')
})
