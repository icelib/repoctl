import type { RegistryMetadata } from '../../../../src/commands/release/nightly/providers/npm/registry'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createNightlyRegistry } from '../../../../src/commands/release/nightly/providers/npm'
import { planDateNightlyVersions } from '../../../../src/commands/release/nightly/versioning'
import { parseDateNightlyVersion } from '../../../../src/commands/release/nightly/versioning/date'
import { json, npmMetadata } from './fixture'
import { reportFixture } from './provider-fixture'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-12T00:01:00Z'))
})
afterEach(() => vi.useRealTimers())

function histories(versions: Record<string, (string | RegistryMetadata)[]> = {}) {
  return vi.fn<typeof fetch>(async (input) => {
    const name = decodeURIComponent(new URL(String(input)).pathname.slice(1))
    const entries = (versions[name] ?? []).map(version => typeof version === 'string' ? { name, version } : version)
    return json({ name, versions: Object.fromEntries(entries.map(entry => [entry.version, entry])) })
  })
}

it('allocates one counter across all public packages and bases using history rather than the channel tag', async () => {
  const report = reportFixture().snapshot!
  report.packages[1]!.version = report.packages[1]!.version.replace('1.0.0-', '7.1.0-')
  const registryFetch = histories({
    '@scope/a': ['1.0.0-dev.20261112.3', '3.0.0-dev.20261111.80', '1.0.0-beta.1'],
    'b': ['7.0.0-dev.20261112.9'],
  })
  await planDateNightlyVersions(report, { cwd: '.', registryFetch })
  expect(report.packages.map(pkg => pkg.version)).toEqual(['1.0.0-dev.20261112.10', '7.1.0-dev.20261112.10'])
  expect(report.install.args).toEqual(['add', '@scope/a@1.0.0-dev.20261112.10', 'b@7.1.0-dev.20261112.10', '--registry', report.registry])
  expect(report.installCommand).toContain('b@7.1.0-dev.20261112.10')
  expect(registryFetch).toHaveBeenCalledWith(new URL('https://registry.npmjs.org/%40scope%2Fa'), expect.objectContaining({ redirect: 'error', headers: { 'accept': 'application/json', 'cache-control': 'no-cache' } }))
})

it('starts at one for missing packages and resets on the next UTC date', async () => {
  const report = reportFixture().snapshot!
  await planDateNightlyVersions(report, { cwd: '.', registryFetch: vi.fn(async () => json({}, 404)) })
  expect(report.packages.map(pkg => pkg.version)).toEqual(['1.0.0-dev.20261112.1', '1.0.0-dev.20261112.1'])
  vi.setSystemTime(new Date('2026-11-12T19:00:00-05:00'))
  await planDateNightlyVersions(report, { cwd: '.', registryFetch: histories({ b: ['1.0.0-dev.20261112.88'] }) })
  expect(report.packages.every(pkg => pkg.version === '1.0.0-dev.20261113.1')).toBe(true)
})

it('freezes the date before registry queries even if planning crosses UTC midnight', async () => {
  vi.setSystemTime(new Date('2026-11-11T23:59:59.999Z'))
  const report = reportFixture().snapshot!
  const registryFetch = histories()
  await planDateNightlyVersions(report, { cwd: '.', registryFetch: async (input, init) => {
    vi.setSystemTime(new Date('2026-11-12T00:00:00Z'))
    return registryFetch(input, init)
  } })
  expect(report.packages.every(pkg => pkg.version === '1.0.0-dev.20261111.1')).toBe(true)
})

it('recovers the same build date and counter after a partial upload even on a later day', async () => {
  const report = reportFixture()
  const published = { ...npmMetadata(report, '@scope/a'), version: '1.0.0-dev.20261111.4' }
  await planDateNightlyVersions(report.snapshot!, { cwd: '.', registryFetch: histories({ '@scope/a': [published], 'b': ['1.0.0-dev.20261112.9'] }) })
  expect(report.snapshot!.packages.every(pkg => pkg.version === '1.0.0-dev.20261111.4')).toBe(true)
})

it.each(['base', 'sequence', 'date', 'identity', 'integrity', 'format'])('rejects conflicting %s evidence for the current build without changing the plan', async (conflict) => {
  const report = reportFixture()
  const first = { ...npmMetadata(report, '@scope/a'), version: '1.0.0-dev.20261111.4' }
  const second = { ...npmMetadata(report, 'b'), version: '1.0.0-dev.20261111.4' }
  if (conflict === 'base') {
    second.version = '2.0.0-dev.20261111.4'
  }
  if (conflict === 'sequence') {
    second.version = '1.0.0-dev.20261111.5'
  }
  if (conflict === 'date') {
    second.version = '1.0.0-dev.20261112.4'
  }
  if (conflict === 'identity') {
    second.repoctlSnapshot.buildId = 'different-build'
  }
  if (conflict === 'integrity') {
    second.dist.integrity = 'sha1-legacy'
  }
  if (conflict === 'format') {
    second.version = report.packages[1]!.version
  }
  const before = structuredClone(report.snapshot)
  await expect(planDateNightlyVersions(report.snapshot!, { cwd: '.', registryFetch: histories({ '@scope/a': [first], 'b': [second] }) })).rejects.toThrow(/conflict/)
  expect(report.snapshot).toEqual(before)
})

it('fails instead of overflowing the daily counter', async () => {
  await expect(planDateNightlyVersions(reportFixture().snapshot!, { cwd: '.', registryFetch: histories({ b: [`1.0.0-dev.20261112.${Number.MAX_SAFE_INTEGER}`] }) })).rejects.toThrow('safe integer limit')
})

it.each([401, 403, 429, 500, 503])('fails closed on version history HTTP %i', async (status) => {
  await expect(planDateNightlyVersions(reportFixture().snapshot!, { cwd: '.', registryFetch: vi.fn(async () => json({}, status)) })).rejects.toThrow(`HTTP ${status}`)
})

it.each([
  [],
  {},
  { name: 'b', versions: {} },
  { name: '@scope/a', versions: [] },
  { name: '@scope/a', versions: { invalid: { name: '@scope/a', version: 'invalid' } } },
  { name: '@scope/a', versions: { '1.0.0': { name: '@scope/a', version: '2.0.0' } } },
  { name: '@scope/a', versions: { '1.0.0': { name: 'other', version: '1.0.0' } } },
])('rejects malformed or mismatched version history %j', async (response) => {
  const registry = createNightlyRegistry({ cwd: '.', registryFetch: vi.fn(async () => json(response)) })
  await expect(registry.versions('@scope/a')).rejects.toThrow(/invalid|does not match/)
})

it('fails on network and invalid JSON instead of allocating the first counter', async () => {
  const registryFetch = vi.fn<typeof fetch>(async () => {
    throw new Error('private network detail')
  })
  await expect(planDateNightlyVersions(reportFixture().snapshot!, { cwd: '.', registryFetch })).rejects.toThrow('publication state is unknown')
  await expect(planDateNightlyVersions(reportFixture().snapshot!, { cwd: '.', registryFetch: vi.fn(async () => new Response('{broken')) })).rejects.toThrow('invalid metadata')
})

it.each(['1.0.0-dev.20260229.1', '1.0.0-dev.20261301.1', '1.0.0-dev.20261112.0', '1.0.0-dev.20261112.01', '1.0.0-dev.20261112.9007199254740992', '1.0.0-dev.20261112.1+build'])('does not recognize invalid date versions %s', (version) => {
  expect(parseDateNightlyVersion(version)).toBeNull()
})

it('recognizes real leap days', () => {
  expect(parseDateNightlyVersion('7.1.0-dev.20280229.1')).toEqual({ base: '7.1.0', date: '20280229', sequence: 1 })
})
