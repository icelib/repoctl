import type { BootstrapOptions, BootstrapSource } from '../types'
import { readFile, realpath } from 'node:fs/promises'
import process from 'node:process'
import { snapshotCommand } from '../../snapshot/process'

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Bootstrap source must be a JSON object.')
  }
  return value as Record<string, unknown>
}

/** 校验冻结身份；显式本地身份只能用于准备，不能替代发布作业授权。 */
export function validateBootstrapSource(value: unknown): BootstrapSource {
  const source = record(value)
  if (Object.keys(source).sort().join(',') !== ['repository', 'repositoryId', 'commit', 'branch', 'runId', 'runAttempt', 'workflowRef'].sort().join(',')
    || typeof source['repository'] !== 'string' || !/^[\w.-]+\/[\w.-]+$/u.test(source['repository'])
    || !['repositoryId', 'runId', 'runAttempt'].every(key => typeof source[key] === 'number' && Number.isSafeInteger(source[key]) && (source[key] as number) > 0)
    || typeof source['commit'] !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(source['commit'])
    || typeof source['branch'] !== 'string' || !/^\w[\w./-]*$/u.test(source['branch']) || source['branch'].includes('..') || source['branch'].includes('//')
    || source['branch'].endsWith('/') || source['branch'].endsWith('.') || source['branch'].split('/').some(part => part.startsWith('.') || part.endsWith('.lock'))
    || typeof source['workflowRef'] !== 'string'
    || source['workflowRef'] !== `${source['repository']}/.github/workflows/release.yml@refs/heads/${source['branch']}`) {
    throw new Error('Bootstrap source requires complete frozen default-branch GitHub identifiers.')
  }
  return { ...source } as unknown as BootstrapSource
}

export async function bootstrapSource(options: BootstrapOptions) {
  const env = options.env ?? process.env
  const source = validateBootstrapSource(options.source ?? {
    repository: env['GITHUB_REPOSITORY'],
    repositoryId: Number(env['GITHUB_REPOSITORY_ID']),
    commit: env['GITHUB_SHA'],
    branch: env['GITHUB_REF']?.replace(/^refs\/heads\//u, ''),
    runId: Number(env['GITHUB_RUN_ID']),
    runAttempt: Number(env['GITHUB_RUN_ATTEMPT']),
    workflowRef: env['GITHUB_WORKFLOW_REF'],
  })
  if (env['GITHUB_ACTIONS'] === 'true') {
    const fields = {
      GITHUB_REPOSITORY: source.repository,
      GITHUB_REPOSITORY_ID: String(source.repositoryId),
      GITHUB_SHA: source.commit,
      GITHUB_REF: `refs/heads/${source.branch}`,
      GITHUB_RUN_ID: String(source.runId),
      GITHUB_RUN_ATTEMPT: String(source.runAttempt),
      GITHUB_WORKFLOW_REF: source.workflowRef,
    }
    if (Object.entries(fields).some(([key, value]) => env[key] !== value) || env['GITHUB_EVENT_NAME'] !== 'workflow_dispatch' || !env['GITHUB_EVENT_PATH']) {
      throw new Error('Bootstrap preparation must match its frozen default-branch workflow_dispatch context.')
    }
    const event = record(JSON.parse(await readFile(env['GITHUB_EVENT_PATH'], 'utf8')))
    const repository = record(event['repository'])
    if (repository['full_name'] !== source.repository || repository['id'] !== source.repositoryId || repository['default_branch'] !== source.branch) {
      throw new Error('Bootstrap source must belong to the event repository default branch.')
    }
  }
  return source
}

export async function bootstrapSourceDirectory(options: BootstrapOptions, source: BootstrapSource) {
  const root = await realpath(snapshotCommand('git', ['rev-parse', '--show-toplevel'], options))
  if (snapshotCommand('git', ['rev-parse', 'HEAD'], options) !== source.commit) {
    throw new Error('Bootstrap source commit must exactly match the checked-out HEAD.')
  }
  const branch = snapshotCommand('git', ['branch', '--show-current'], options)
  if (branch && branch !== source.branch) {
    throw new Error('Bootstrap source must be checked out on the frozen default branch or detached at its commit.')
  }
  if (snapshotCommand('git', ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=all'], options)) {
    throw new Error('Bootstrap preparation requires a clean committed source tree, including untracked files.')
  }
  if (/^(?:120000|160000) /mu.test(snapshotCommand('git', ['ls-tree', '-r', source.commit], options))) {
    throw new Error('Bootstrap source archives do not support symbolic links or Git submodules.')
  }
  return root
}
