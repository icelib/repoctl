import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { createSnapshotFreezeRecord, freezeSnapshotSource, verifySnapshotRun } from '../../../../../../src/commands/release/snapshot/prepared/github'
import { record } from '../../../../../../src/commands/release/snapshot/prepared/github/client'
import { githubFixture } from './fixture'

it('verifies frozen GitHub job evidence and exact artifacts even when workflow_run has no PRs', async () => {
  const h = githubFixture()
  const result = await verifySnapshotRun(h.options)
  expect(result.plan).toEqual(h.prepared.plan)
  expect(result.manifest).toEqual(h.prepared.manifest)
  expect([...result.files].map(([name, bytes]) => [name, Buffer.from(bytes)]))
    .toEqual([...h.prepared.files].map(([name, bytes]) => [name, Buffer.from(bytes)]))
  expect(result.evidence.planArtifact).toEqual(h.planArtifact)
  expect(result.evidence.buildArtifact).toEqual(h.buildArtifact)
  expect(h.requests.filter(request => request.url.startsWith('https://api.github.com')).every(request => request.authorization === 'Bearer github-secret')).toBe(true)
  expect(h.requests.filter(request => request.url.startsWith('https://storage.example')).every(request => request.authorization === null && request.redirect === 'error')).toBe(true)
  await result.assertCurrent()
})

it('freezes authoritative source facts before checking out candidate code', async () => {
  const h = githubFixture()
  h.run.status = 'in_progress'
  const result = await freezeSnapshotSource({ ...h.options, pullRequest: 42, workflowPath: h.options.policy.workflowPath })
  expect(result).toEqual(h.prepared.plan.source)
  expect(h.requests.some(request => request.url.includes('/artifacts'))).toBe(false)
})

describe('rejects invalid GitHub trust evidence', () => {
  const cases: Array<[string, (h: ReturnType<typeof githubFixture>) => void, RegExp]> = [
    ['wrong event', (h) => { h.run.event = 'pull_request' }, /default-branch builder/],
    ['non-default branch', (h) => { h.run.head_branch = 'untrusted' }, /default-branch builder/],
    ['superseded attempt', (h) => { h.run.run_attempt++ }, /default-branch builder/],
    ['unsuccessful build run', (h) => { h.run.conclusion = 'failure' }, /default-branch builder/],
    ['unexpected workflow bytes', (h) => { h.options.policy.workflowSha256 = 'f'.repeat(64) }, /workflow bytes/],
    ['old freeze approval attempt', (h) => { h.jobs[0]!.run_attempt-- }, /re-run all builder jobs/],
    ['candidate ran before freezing', (h) => { h.jobs[1]!.started_at = '2026-10-26T01:00:30Z' }, /after the trusted plan/],
    ['missing environment approval', (h) => { h.routes.set('/actions/runs/123/approvals', []) }, /verified approval/],
    ['admin bypass', (h) => { record(h.routes.get('/environments/pr-snapshot'))['can_admins_bypass'] = true }, /protected reviewer environment/],
    ['unprotected environment', (h) => { record(h.routes.get('/environments/pr-snapshot'))['protection_rules'] = [] }, /protected reviewer environment/],
    ['fork PR', (h) => { record(record(record(h.routes.get('/pulls/42'))['head'])['repo'])['fork'] = true }, /forks cannot publish/],
    ['closed PR', (h) => { record(h.routes.get('/pulls/42'))['state'] = 'closed' }, /open, ready/],
    ['draft PR', (h) => { record(h.routes.get('/pulls/42'))['draft'] = true }, /open, ready/],
    ['changed head ref', (h) => { h.routes.set('/git/ref/heads/feature', { object: { sha: 'f'.repeat(40) } }) }, /revision, branch refs or merge parents/],
    ['changed base ref', (h) => { h.routes.set('/git/ref/heads/main', { object: { sha: h.prepared.plan.source.workflowSha } }) }, /revision, branch refs or merge parents/],
    ['changed merge parents', (h) => { record(h.routes.get(`/git/commits/${h.prepared.plan.source.mergeSha}`))['parents'] = [] }, /merge parents/],
    ['expired plan artifact', (h) => { record(h.routes.get('/actions/artifacts/1001'))['expired'] = true }, /artifact identity/],
    ['artifact from another run', (h) => { record(record(h.routes.get('/actions/artifacts/1002'))['workflow_run'])['id'] = 456 }, /artifact identity/],
    ['artifact ID override', (h) => { h.options.artifactId = 999 }, /exactly one matching/],
    ['duplicate artifact name', (h) => {
      const list = record(h.routes.get('/actions/runs/123/artifacts'))['artifacts'] as unknown[]
      list.push(structuredClone(list[1]))
    }, /exactly one matching/],
  ]
  it.each(cases)('%s', async (_, mutate, expected) => {
    const h = githubFixture()
    mutate(h)
    await expect(verifySnapshotRun(h.options)).rejects.toThrow(expected)
  })
})

it('requires the unique trusted freeze job log record rather than candidate claims or artifact timestamps', async () => {
  const h = githubFixture()
  h.downloads.set('/actions/jobs/501/logs', Buffer.from(`${h.anchor}\n${h.anchor}\n`))
  await expect(verifySnapshotRun(h.options)).rejects.toThrow('exactly one complete')
  h.downloads.set('/actions/jobs/501/logs', Buffer.from('No evidence record\n'))
  await expect(verifySnapshotRun(h.options)).rejects.toThrow('exactly one complete')
  h.downloads.set('/actions/jobs/501/logs', Buffer.from(createSnapshotFreezeRecord(h.prepared.plan, h.buildArtifact)))
  await expect(verifySnapshotRun(h.options)).rejects.toThrow('artifact identity')
})

it('hashes downloaded ZIP bytes rather than trusting the API digest alone', async () => {
  const h = githubFixture()
  const bytes = Buffer.from(h.downloads.get('/actions/artifacts/1002/zip')!)
  bytes[40] = bytes[40]! ^ 1
  h.downloads.set('/actions/artifacts/1002/zip', bytes)
  await expect(verifySnapshotRun(h.options)).rejects.toThrow('ZIP digest')
})

it('rechecks a live PR after verification and refuses changes before the first upload', async () => {
  const h = githubFixture()
  const result = await verifySnapshotRun(h.options)
  record(record(h.routes.get('/pulls/42'))['head'])['sha'] = 'f'.repeat(40)
  await expect(result.assertCurrent()).rejects.toThrow('revision, branch refs or merge parents')
})

it('fails closed when the trusted job logs have expired', async () => {
  const h = githubFixture()
  const fetcher: typeof globalThis.fetch = async (input, init) => String(input).includes('/jobs/501/logs') ? new Response(null, { status: 410 }) : h.fetcher(input, init)
  await expect(verifySnapshotRun({ ...h.options, fetch: fetcher })).rejects.toThrow('HTTP 410')
})

it('refuses unsafe GitHub storage redirects before contacting their destinations', async () => {
  const h = githubFixture()
  const fetcher: typeof globalThis.fetch = async (input, init) => String(input).includes('/jobs/501/logs')
    ? new Response(null, { status: 302, headers: { location: 'http://storage.example/unsafe' } })
    : h.fetcher(input, init)
  await expect(verifySnapshotRun({ ...h.options, fetch: fetcher })).rejects.toThrow('unsafe download redirect')
  expect(h.requests.some(request => request.url.startsWith('http://'))).toBe(false)
})
