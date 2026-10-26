import type { SnapshotSource } from '../types'
import type { SnapshotGitHub } from './client'
import type { FreezeSnapshotSourceOptions, GitHubRecord, SnapshotGitHubOptions } from './types'
import { createSnapshotGitHub, positive, record, sha } from './client'

export async function readSnapshotRun(client: SnapshotGitHub, options: SnapshotGitHubOptions & { runId: number, runAttempt: number, workflowPath: string }, completed: boolean) {
  positive(options.runId, 'workflow run ID')
  positive(options.runAttempt, 'workflow run attempt')
  if (!/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(options.workflowPath)) {
    throw new Error('Snapshot builder must be a named workflow in .github/workflows.')
  }
  const repository = record(await client.json(''))
  const run = record(await client.json(`/actions/runs/${options.runId}`))
  const workflow = record(await client.json(`/actions/workflows/${positive(run['workflow_id'], 'workflow ID')}`))
  const repositoryId = positive(repository['id'], 'repository ID')
  const defaultBranch = repository['default_branch']
  if (repository['full_name'] !== options.repository || typeof defaultBranch !== 'string' || !defaultBranch
    || run['id'] !== options.runId || run['run_attempt'] !== options.runAttempt
    || run['event'] !== 'workflow_dispatch' || run['head_branch'] !== defaultBranch
    || record(run['repository'])['id'] !== repositoryId || record(run['repository'])['full_name'] !== options.repository
    || record(run['head_repository'])['id'] !== repositoryId || record(run['head_repository'])['full_name'] !== options.repository
    || run['path'] !== options.workflowPath || workflow['id'] !== run['workflow_id'] || workflow['path'] !== options.workflowPath || workflow['state'] !== 'active'
    || (completed && (run['status'] !== 'completed' || run['conclusion'] !== 'success'))) {
    throw new Error('Snapshot source must be the latest successful attempt of the trusted default-branch builder.')
  }
  const workflowSha = sha(run['head_sha'])
  const branch = record(await client.json(`/git/ref/heads/${encodeURIComponent(defaultBranch)}`))
  const current = sha(record(branch['object'])['sha'])
  if (current !== workflowSha) {
    const comparison = record(await client.json(`/compare/${workflowSha}...${current}`))
    if (comparison['status'] !== 'ahead' || record(comparison['merge_base_commit'])['sha'] !== workflowSha) {
      throw new Error('Snapshot builder revision is not on the trusted default branch.')
    }
  }
  return { run, repositoryId, defaultBranch, workflowSha, workflowId: positive(run['workflow_id'], 'workflow ID') }
}

function pullRequest(value: unknown, repository: string, repositoryId: number): GitHubRecord {
  const pr = record(value)
  const head = record(pr['head'])
  const base = record(pr['base'])
  const headRepository = record(head['repo'])
  const baseRepository = record(base['repo'])
  if (pr['state'] !== 'open' || pr['draft'] !== false || pr['mergeable'] !== true
    || headRepository['fork'] !== false || headRepository['full_name'] !== repository || headRepository['id'] !== repositoryId
    || baseRepository['full_name'] !== repository || baseRepository['id'] !== repositoryId
    || typeof head['ref'] !== 'string' || !head['ref'] || typeof base['ref'] !== 'string' || !base['ref']) {
    throw new Error('Snapshot publication requires an open, ready, mergeable same-repository PR; forks cannot publish.')
  }
  return pr
}

export async function assertSnapshotSourceCurrent(client: SnapshotGitHub, source: SnapshotSource) {
  const pr = pullRequest(await client.json(`/pulls/${positive(source.pullRequest, 'PR number')}`), source.repository, source.repositoryId)
  const head = record(pr['head'])
  const base = record(pr['base'])
  const headRef = record(await client.json(`/git/ref/heads/${encodeURIComponent(String(head['ref']))}`))
  const baseRef = record(await client.json(`/git/ref/heads/${encodeURIComponent(source.baseRef)}`))
  const merge = record(await client.json(`/git/commits/${source.mergeSha}`))
  const parents = merge['parents']
  if (pr['number'] !== source.pullRequest || head['sha'] !== source.headSha || base['sha'] !== source.baseSha || base['ref'] !== source.baseRef
    || pr['merge_commit_sha'] !== source.mergeSha || record(headRef['object'])['sha'] !== source.headSha
    || record(baseRef['object'])['sha'] !== source.baseSha || merge['sha'] !== source.mergeSha
    || !Array.isArray(parents) || parents.length !== 2
    || record(parents[0])['sha'] !== source.baseSha || record(parents[1])['sha'] !== source.headSha) {
    throw new Error('Snapshot PR revision, branch refs or merge parents changed; build and approve the current revision.')
  }
}

/** Resolve authoritative source identities before checking out any candidate code. */
export async function freezeSnapshotSource(options: FreezeSnapshotSourceOptions): Promise<SnapshotSource> {
  const client = createSnapshotGitHub(options)
  const run = await readSnapshotRun(client, options, false)
  const pr = pullRequest(await client.json(`/pulls/${positive(options.pullRequest, 'PR number')}`), options.repository, run.repositoryId)
  const source: SnapshotSource = {
    repository: options.repository,
    repositoryId: run.repositoryId,
    pullRequest: options.pullRequest,
    headSha: sha(record(pr['head'])['sha']),
    baseSha: sha(record(pr['base'])['sha']),
    baseRef: String(record(pr['base'])['ref']),
    mergeSha: sha(pr['merge_commit_sha']),
    runId: options.runId,
    runAttempt: options.runAttempt,
    workflowId: run.workflowId,
    workflowPath: options.workflowPath,
    workflowSha: run.workflowSha,
    defaultBranch: run.defaultBranch,
  }
  await assertSnapshotSourceCurrent(client, source)
  return source
}
