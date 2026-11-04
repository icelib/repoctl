import type { BootstrapOptions } from './types'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { downloadSnapshotArtifact } from '../snapshot/prepared/github/archive'
import { createSnapshotGitHub, digest, positive, record } from '../snapshot/prepared/github/client'
import { bootstrapWorkflow, matchBootstrapRequest, validateBootstrapArchive, validateBootstrapManifest } from './schema'

/** 仅默认分支的同一发布工作流可取得上传或恢复资格。 */
export function bootstrapInvocation(options: BootstrapOptions) {
  const env = options.env ?? process.env
  const repository = env['GITHUB_REPOSITORY'] ?? ''
  const ref = env['GITHUB_REF'] ?? ''
  assert.equal(env['GITHUB_ACTIONS'], 'true', 'Bootstrap publication requires GitHub Actions')
  assert.equal(env['GITHUB_EVENT_NAME'], 'workflow_dispatch')
  assert.ok(ref.startsWith('refs/heads/') && ref.length > 'refs/heads/'.length)
  assert.equal(env['GITHUB_WORKFLOW_REF'], `${repository}/${bootstrapWorkflow}@${ref}`)
  return { env, repository, branch: ref.slice('refs/heads/'.length), currentRun: positive(Number(env['GITHUB_RUN_ID']), 'current run ID') }
}

/** 核验平台记录和不可变 ZIP 后才信任原运行的纯数据与 tarball。 */
export async function bootstrapBundle(options: BootstrapOptions, kind: 'prepared' | 'publication') {
  const context = bootstrapInvocation(options)
  const runId = positive(options.verifyRunId ?? options.runId ?? context.currentRun, 'source run ID')
  if (kind === 'prepared') {
    assert.equal(runId, context.currentRun, 'Bootstrap upload must use this run\'s prepared artifact')
  }
  const token = options.token ?? context.env['GITHUB_TOKEN']
  const client = createSnapshotGitHub({ repository: context.repository, ...(token ? { token } : {}), ...(options.fetch ? { fetch: options.fetch } : {}) })
  const repository = record(await client.json(''))
  assert.equal(repository['full_name'], context.repository)
  assert.equal(repository['default_branch'], context.branch, 'Bootstrap requires the repository default branch')
  const repositoryId = positive(repository['id'], 'repository ID')
  const run = record(await client.json(`/actions/runs/${runId}`))
  assert.equal(run['id'], runId)
  assert.equal(record(run['repository'])['id'], repositoryId)
  assert.equal(record(run['head_repository'])['id'], repositoryId)
  assert.equal(run['head_branch'], context.branch)
  assert.equal(run['path'], bootstrapWorkflow)
  assert.equal(run['event'], 'workflow_dispatch')
  if (runId !== context.currentRun) {
    assert.equal(run['status'], 'completed', 'Wait for the original bootstrap run to complete')
  }
  const attempt = positive(options.runAttempt ?? run['run_attempt'], 'run attempt')
  if (kind === 'prepared') {
    assert.equal(attempt, positive(Number(context.env['GITHUB_RUN_ATTEMPT']), 'current run attempt'), 'Bootstrap upload requires preparation from the current run attempt')
    assert.equal(attempt, run['run_attempt'])
  }
  const jobs = await client.list(`/actions/runs/${runId}/attempts/${attempt}/jobs`, 'jobs')
  const name = kind === 'prepared' ? 'Prepare bootstrap package' : 'Publish bootstrap package'
  const matches = jobs.filter(job => job['name'] === name)
  assert.equal(matches.length, 1, 'Bootstrap source job is missing or ambiguous')
  const job = matches[0]!
  assert.equal(job['run_id'], runId)
  assert.equal(job['run_attempt'], attempt)
  assert.equal(job['status'], 'completed')
  if (kind === 'prepared') {
    assert.equal(job['conclusion'], 'success', 'Bootstrap preparation must have succeeded')
  }
  const artifactName = kind === 'prepared' ? `repoctl-bootstrap-${runId}-${attempt}` : `repoctl-bootstrap-publication-${runId}-${attempt}`
  const artifacts = (await client.list(`/actions/runs/${runId}/artifacts`, 'artifacts')).filter(artifact => artifact['name'] === artifactName && artifact['expired'] === false)
  assert.equal(artifacts.length, 1, 'Bootstrap requires one unexpired immutable artifact')
  const artifact = artifacts[0]!
  const files = await downloadSnapshotArtifact(client, { artifact: { id: positive(artifact['id'], 'artifact ID'), digest: digest(artifact['digest']) }, name: artifactName, runId, repositoryId, workflowSha: String(run['head_sha']) })
  const raw = files.get('bootstrap-manifest.json')
  assert.ok(raw, 'Bootstrap artifact has no manifest')
  const manifest = validateBootstrapManifest(JSON.parse(Buffer.from(raw).toString('utf8')))
  assert.deepEqual(manifest.source, { repository: context.repository, repositoryId, branch: context.branch, commit: run['head_sha'], runId, runAttempt: attempt, workflowRef: `${context.repository}/${bootstrapWorkflow}@refs/heads/${context.branch}` })
  if (kind === 'prepared') {
    assert.equal(manifest.source.commit, context.env['GITHUB_SHA'])
  }
  matchBootstrapRequest(manifest, options)
  const tarball = files.get(manifest.package.tarball)
  assert.ok(tarball, 'Bootstrap artifact has no tarball')
  await validateBootstrapArchive(manifest, tarball)
  return { manifest, tarball, files, context, artifact: { id: artifact['id'], digest: artifact['digest'], runId, runAttempt: attempt } }
}
