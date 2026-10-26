import type { AutoChangesetOptions, AutoChangesetRevision } from '../types'
import type { AutoChangesetGitHub } from './client'
import process from 'node:process'
import { positive, record, sha, textValue } from './client'

function branch(value: unknown) {
  const result = textValue(value, 'Git branch')
  if (/^[/-]|[~^:?*[\\\s]|\.\.|@\{|\/$|\.$|\.lock(?:\/|$)|\/\//u.test(result)) {
    throw new Error('Invalid Git branch.')
  }
  return result
}

export async function readRevision(client: AutoChangesetGitHub, options: AutoChangesetOptions): Promise<Omit<AutoChangesetRevision, 'policyDigest'>> {
  const [repository, pull, labelRecords] = await Promise.all([
    client.json('').then(value => record(value)),
    client.json(`/pulls/${options.pullRequest}`).then(value => record(value)),
    client.list(`/issues/${options.pullRequest}/labels`),
  ])
  if (repository['full_name'] !== options.repository || pull['number'] !== options.pullRequest) {
    throw new Error('GitHub repository or pull request identity mismatch.')
  }
  const repositoryId = positive(repository['id'], 'repository ID')
  const defaultBranch = branch(repository['default_branch'])
  const head = record(pull['head'], 'pull request head')
  const base = record(pull['base'], 'pull request base')
  const headRepo = record(head['repo'], 'head repository')
  const baseRepo = record(base['repo'], 'base repository')
  if (baseRepo['id'] !== repositoryId || baseRepo['full_name'] !== options.repository) {
    throw new Error('Pull request base repository mismatch.')
  }
  const state = pull['state']
  const changedFiles = pull['changed_files']
  if (!['open', 'closed'].includes(String(state)) || typeof pull['draft'] !== 'boolean'
    || typeof changedFiles !== 'number' || !Number.isSafeInteger(changedFiles) || changedFiles < 0 || changedFiles > 3000) {
    throw new Error('Incomplete pull request metadata or file count exceeds the GitHub API limit.')
  }
  const labels = labelRecords.map(label => textValue(label['name'], 'pull request label')).sort()
  const embeddedLabels = pull['labels']
  if (!Array.isArray(embeddedLabels) || new Set(labels).size !== labels.length
    || JSON.stringify(embeddedLabels.map(label => textValue(record(label)['name'], 'embedded pull request label')).sort()) !== JSON.stringify(labels)) {
    throw new Error('Incomplete, duplicate, or changing labels in GitHub pagination.')
  }
  const policyRef = record(await client.json(`/git/ref/heads/${defaultBranch.split('/').map(encodeURIComponent).join('/')}`))
  const env = options.env ?? process.env
  const workflowRun = env['GITHUB_ACTIONS'] === 'true'
    ? { id: positive(Number(env['GITHUB_RUN_ID']), 'workflow run ID'), attempt: positive(Number(env['GITHUB_RUN_ATTEMPT']), 'workflow run attempt') }
    : undefined
  const result = {
    repository: options.repository,
    repositoryId,
    pullRequest: options.pullRequest,
    headRepository: textValue(headRepo['full_name'], 'head repository name'),
    headRepositoryId: positive(headRepo['id'], 'head repository ID'),
    headSha: sha(head['sha']),
    headRef: branch(head['ref']),
    baseSha: sha(base['sha']),
    baseRef: branch(base['ref']),
    defaultBranch,
    policySha: sha(record(policyRef['object'])['sha']),
    title: textValue(pull['title'], 'pull request title'),
    labels,
    changedFiles,
    state: state as 'open' | 'closed',
    draft: pull['draft'],
    ...(workflowRun ? { workflowRun } : {}),
  }
  if ((options.expectedHeadSha && options.expectedHeadSha !== result.headSha)
    || (options.expectedBaseSha && options.expectedBaseSha !== result.baseSha)) {
    throw new Error('Pull request head/base is stale.')
  }
  return result
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function assertRevision(actual: AutoChangesetRevision, expected: AutoChangesetRevision) {
  if (canonical(actual) !== canonical(expected)) {
    throw new Error('Frozen auto changeset revision is stale; plan again and obtain a fresh approval.')
  }
}
