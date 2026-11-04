import { Buffer } from 'node:buffer'
import { expect, it } from 'vitest'
import { bootstrapBundle } from '@/commands/release/bootstrap/evidence'
import { evidenceFixture } from './evidenceFixture'

it('verifies the platform identity, immutable ZIP and tarball bytes without executing the candidate', async () => {
  const h = evidenceFixture()
  const result = await bootstrapBundle(h.options, 'prepared')
  expect(result.manifest).toEqual(h.manifest)
  expect(Buffer.from(result.tarball)).toEqual(Buffer.from(h.tarball))
  expect(result.artifact).toEqual({ id: h.artifact.id, digest: h.artifact.digest, runId: 123, runAttempt: 2 })
  expect(h.requests.filter(request => request.url.startsWith('https://api.github.com')).every(request => request.authorization === 'Bearer fixture-github-token')).toBe(true)
  expect(h.requests.filter(request => request.url.startsWith('https://storage.example')).every(request => request.authorization === null)).toBe(true)
})

const invalidEvidence: Array<[string, (h: ReturnType<typeof evidenceFixture>) => void]> = [
  ['fork source repository', (h) => { h.run.head_repository.id = 999 }],
  ['another repository', (h) => { h.run.repository.id = 999 }],
  ['non-default branch', (h) => { h.repository.default_branch = 'trunk' }],
  ['another source branch', (h) => { h.run.head_branch = 'feature' }],
  ['another workflow', (h) => { h.run.path = '.github/workflows/untrusted.yml' }],
  ['another source event', (h) => { h.run.event = 'push' }],
  ['another run', (h) => { h.run.id++ }],
  ['another job run', (h) => { h.jobs[0]!.run_id++ }],
  ['another job attempt', (h) => { h.jobs[0]!.run_attempt++ }],
  ['another source job', (h) => { h.jobs[0]!.name = 'Untrusted preparation' }],
  ['unfinished preparation', (h) => { h.jobs[0]!.status = 'in_progress' }],
  ['failed preparation', (h) => { h.jobs[0]!.conclusion = 'failure' }],
  ['ambiguous source jobs', (h) => { h.jobs.push({ ...h.jobs[0]! }) }],
  ['expired artifact', (h) => { h.listedArtifact.expired = true }],
  ['duplicate artifact', (h) => { h.routes.set('/actions/runs/123/artifacts', { artifacts: [h.listedArtifact, { ...h.listedArtifact }] }) }],
  ['artifact from another run', (h) => { h.artifact.workflow_run.id++ }],
  ['artifact from another repository', (h) => { h.artifact.workflow_run.repository_id++ }],
  ['artifact from a fork', (h) => { h.artifact.workflow_run.head_repository_id++ }],
  ['artifact from another commit', (h) => { h.artifact.workflow_run.head_sha = 'b'.repeat(40) }],
  ['different artifact metadata digest', (h) => { h.artifact.digest = `sha256:${'f'.repeat(64)}` }],
  ['different current commit', (h) => { h.env['GITHUB_SHA'] = 'b'.repeat(40) }],
  ['different package request', (h) => { h.options.packageName = '@scope/other' }],
  ['different version request', (h) => { h.options.version = '1.0.0-alpha.1' }],
  ['different tag request', (h) => { h.options.tag = 'beta' }],
]

it.each(invalidEvidence)('rejects %s before exposing trusted bytes', async (_, mutate) => {
  const h = evidenceFixture()
  mutate(h)
  await expect(bootstrapBundle(h.options, 'prepared')).rejects.toThrow()
})

it.each([
  { GITHUB_ACTIONS: 'false' },
  { GITHUB_EVENT_NAME: 'pull_request' },
  { GITHUB_WORKFLOW_REF: 'acme/repo/.github/workflows/other.yml@refs/heads/main' },
  { GITHUB_REF: 'refs/tags/v1' },
  { GITHUB_RUN_ID: '0' },
])('rejects an untrusted current invocation before GitHub requests: %j', async (env) => {
  const h = evidenceFixture()
  Object.assign(h.env, env)
  await expect(bootstrapBundle(h.options, 'prepared')).rejects.toThrow()
  expect(h.requests).toEqual([])
})

it('rejects altered ZIP downloads even when GitHub metadata is unchanged', async () => {
  const h = evidenceFixture()
  const route = '/actions/artifacts/1001/zip'
  const bytes = Buffer.from(h.downloads.get(route)!)
  bytes[40] = bytes[40]! ^ 1
  h.downloads.set(route, bytes)
  await expect(bootstrapBundle(h.options, 'prepared')).rejects.toThrow('ZIP digest')
})

it('checks tarball integrity independently of a valid outer artifact digest', async () => {
  const h = evidenceFixture()
  const bytes = Buffer.from(h.tarball)
  bytes[20] = bytes[20]! ^ 1
  h.files.set(h.manifest.package.tarball, bytes)
  h.seal()
  await expect(bootstrapBundle(h.options, 'prepared')).rejects.toThrow('tarball integrity')
})

it.each(['bootstrap-manifest.json', 'tarballs/package.tgz'])('requires the frozen artifact entry %s', async (name) => {
  const h = evidenceFixture()
  h.files.delete(name)
  h.seal()
  await expect(bootstrapBundle(h.options, 'prepared')).rejects.toThrow(/no manifest|no tarball/)
})

it('rejects a different manifest source attempt even inside a valid immutable ZIP', async () => {
  const h = evidenceFixture()
  h.manifest.source.runAttempt++
  h.encodeManifest()
  h.seal()
  await expect(bootstrapBundle(h.options, 'prepared')).rejects.toThrow()
})

it('requires the current prepared run and attempt rather than a previous successful attempt', async () => {
  const h = evidenceFixture()
  await expect(bootstrapBundle({ ...h.options, runId: 456 }, 'prepared')).rejects.toThrow('this run')
  h.options.runAttempt = 1
  h.jobs[0]!.run_attempt = 1
  h.routes.set('/actions/runs/123/attempts/1/jobs', { jobs: h.jobs })
  h.manifest.source.runAttempt = 1
  h.artifact.name = 'repoctl-bootstrap-123-1'
  h.listedArtifact.name = h.artifact.name
  h.encodeManifest()
  h.seal()
  await expect(bootstrapBundle(h.options, 'prepared')).rejects.toThrow()
})

it('allows recovery from a completed failed run only with its original publication job and artifact', async () => {
  const h = evidenceFixture('publication')
  const result = await bootstrapBundle(h.options, 'publication')
  expect(result.manifest.source.runId).toBe(123)
  expect(result.context.currentRun).toBe(999)
  expect(h.run.conclusion).toBe('failure')
  h.run.status = 'in_progress'
  await expect(bootstrapBundle(h.options, 'publication')).rejects.toThrow('original bootstrap run to complete')
})
