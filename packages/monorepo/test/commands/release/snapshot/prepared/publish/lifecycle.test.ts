import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { publishPreparedSnapshot } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { publicationFixture } from './fixture'

it('publishes only the approved tarballs, preserves real publisher provenance and latest, then retries idempotently', async () => {
  const h = await publicationFixture()
  const report = await publishPreparedSnapshot(h.options)
  expect(report.status, report.error).toBe('published')
  expect(h.uploads).toEqual(h.prepared.plan.packages.map(pkg => pkg.name))
  expect(h.commands).toHaveLength(2)
  expect(h.oidc).toEqual(['identity', ...h.prepared.plan.packages.map(pkg => pkg.name)])
  expect([...h.tags.values()].every(tags => tags['latest'] === '1.0.0')).toBe(true)
  expect(report.packages.every(pkg => pkg.published)).toBe(true)
  expect(report.install.args).toContain(`@scope/a@${h.prepared.plan.packages[0]!.version}`)
  expect(JSON.parse(await readFile(path.join(report.outputDirectory, 'publication-report.json'), 'utf8')).status).toBe('published')
  const repeated = await publishPreparedSnapshot(h.options)
  expect(repeated.status, repeated.error).toBe('published')
  expect(h.uploads).toHaveLength(2)
})

it('resumes after a partial upload using immutable registry evidence without repeating accepted artifacts', async () => {
  const h = await publicationFixture()
  h.faults.upload = '@scope/b'
  const first = await publishPreparedSnapshot(h.options)
  expect(first.status).toBe('failed')
  expect(first.packages.map(pkg => pkg.published)).toEqual([true, false])
  expect(h.uploads).toEqual(['@scope/a'])
  h.faults.upload = ''
  const recovered = await publishPreparedSnapshot(h.options)
  expect(recovered.status, recovered.error).toBe('published')
  expect(h.uploads).toEqual(['@scope/a', '@scope/b'])
})

it('replaces only an older valid snapshot belonging to the same PR', async () => {
  const h = await publicationFixture()
  h.previous('@scope/a')
  h.previous('@scope/b')
  const report = await publishPreparedSnapshot(h.options)
  expect(report.status, report.error).toBe('published')
  expect(h.uploads).toHaveLength(2)
})

it.each(['registry-conflict', 'registry-unknown', 'tag-ahead-of-metadata', 'newer-tag', 'unrelated-tag', 'forged-prior-identity', 'oidc', 'oidc-event'])('completes all preflight checks before upload: %s', async (kind) => {
  const h = await publicationFixture()
  if (kind === 'registry-conflict') {
    h.published('@scope/b')
    h.versions.set(`@scope/b@${h.prepared.plan.packages[1]!.version}`, { ...h.metadata('@scope/b'), dist: { integrity: 'sha512-conflict' } })
  }
  if (kind === 'registry-unknown') {
    h.faults.registry = 401
  }
  if (kind === 'tag-ahead-of-metadata') {
    h.tags.get('@scope/b')![h.prepared.plan.tag] = h.prepared.plan.packages[1]!.version
  }
  if (kind === 'newer-tag') {
    h.previous('@scope/b', 'run-124-attempt-1')
  }
  if (kind === 'unrelated-tag') {
    h.tags.get('@scope/b')![h.prepared.plan.tag] = '1.0.0'
  }
  if (kind === 'forged-prior-identity') {
    h.previous('@scope/b').repoctlSnapshot.identityKey = 'f'.repeat(64)
  }
  if (kind === 'oidc') {
    h.faults.oidc = '@scope/b'
  }
  if (kind === 'oidc-event') {
    h.claims.event_name = 'pull_request'
  }
  const report = await publishPreparedSnapshot(h.options)
  expect(report.status, report.error).toBe('failed')
  expect(h.uploads).toEqual([])
  expect(h.commands).toEqual([])
  if (!kind.startsWith('oidc')) {
    expect(h.oidc).toEqual([])
  }
})

it('rechecks the current PR after auditing OIDC and before the first upload', async () => {
  const h = await publicationFixture()
  h.faults.beforeOidc = () => {
    h.routes.set('/git/ref/heads/feature', { object: { sha: 'f'.repeat(40) } })
  }
  const report = await publishPreparedSnapshot(h.options)
  expect(report.status).toBe('failed')
  expect(report.error).toContain('revision')
  expect(h.uploads).toEqual([])
})

it('stops remaining uploads if latest changes concurrently, preserving the external update', async () => {
  const h = await publicationFixture()
  h.faults.afterUpload = () => {
    h.tags.get('@scope/b')!['latest'] = '2.0.0'
  }
  const report = await publishPreparedSnapshot(h.options)
  expect(report.status).toBe('failed')
  expect(report.error).toContain('latest')
  expect(h.uploads).toEqual(['@scope/a'])
  expect(h.tags.get('@scope/b')!['latest']).toBe('2.0.0')
})

it('rechecks approval source revision after transient retry waits before starting another upload', async () => {
  const h = await publicationFixture()
  h.faults.transient = 1
  const waits: number[] = []
  const report = await publishPreparedSnapshot({ ...h.options, sleep: async (milliseconds) => {
    waits.push(milliseconds)
    h.routes.set('/git/ref/heads/feature', { object: { sha: 'f'.repeat(40) } })
  } })
  expect(waits).toContain(20_000)
  expect(report.status).toBe('failed')
  expect(report.error).toContain('revision')
  expect(h.commands).toHaveLength(1)
  expect(h.uploads).toEqual([])
})

it('reconciles accepted uploads without rerunning the upload gate against its own newly published tag', async () => {
  const h = await publicationFixture()
  h.faults.acceptedError = true
  const report = await publishPreparedSnapshot(h.options)
  expect(report.status, report.error).toBe('published')
  expect(h.uploads).toEqual(['@scope/a', '@scope/b'])
  expect(h.commands).toHaveLength(2)
})
