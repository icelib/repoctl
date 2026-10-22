import type { ReleaseLifecycleState, ReleaseStateSnapshot } from '../lifecycle/types'
import type { GitHubRequest } from './types'
import { Buffer } from 'node:buffer'
import { ReleaseCommandError } from '../errors'

const branch = 'repoctl-release-state'

interface ReleaseStateWriteOptions {
  retryAttempts?: number
  retryDelay?: number
  sleep?: (milliseconds: number) => Promise<void>
}

function missing(error: unknown) {
  return error instanceof Error && 'status' in error && error.status === 404
}

function statePath(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) {
    throw new ReleaseCommandError('Invalid release state key')
  }
  return `/contents/.repoctl-release/${key}.json`
}

function automationPath(key: string) {
  if (!/^(?:releases\/[a-f0-9]{64}|docs\/[a-z0-9][a-z0-9-]*\/(?:stable|preview))$/.test(key)) {
    throw new ReleaseCommandError('Invalid automation state key')
  }
  return `/contents/.repoctl-automation/${key}.json`
}

async function readState(request: GitHubRequest, endpoint: string) {
  try {
    const { data } = await request<{ sha: string, content: string }>('GET', `${endpoint}?ref=${branch}`)
    if (!data?.sha || !data.content) {
      throw new ReleaseCommandError('GitHub returned an invalid release checkpoint')
    }
    return { revision: data.sha, value: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')) as unknown }
  }
  catch (error) {
    if (missing(error)) {
      return undefined
    }
    throw error
  }
}

export async function readReleaseState(request: GitHubRequest, key: string): Promise<ReleaseStateSnapshot | undefined> {
  const snapshot = await readState(request, statePath(key))
  return snapshot ? { revision: snapshot.revision, state: snapshot.value as ReleaseLifecycleState } : undefined
}

export function readAutomationState(request: GitHubRequest, key: string) {
  return readState(request, automationPath(key))
}

function transient(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error) || typeof error.status !== 'number') {
    return false
  }
  return error.status === 0 || error.status === 429 || error.status >= 500
}

async function writeState(request: GitHubRequest, endpoint: string, state: unknown, revision?: string, options: ReleaseStateWriteOptions = {}) {
  if (!revision) {
    try {
      await request('GET', `/git/ref/heads/${branch}`)
    }
    catch (error) {
      if (!missing(error)) {
        throw error
      }
      // Keep release checkpoints independent of source history and workflow permissions.
      const { data: tree } = await request<{ sha: string }>('POST', '/git/trees', {
        tree: [{
          path: '.repoctl-release/README.md',
          mode: '100644',
          type: 'blob',
          content: '# Release checkpoints\n\nManaged by repoctl. Package source commits are recorded in each checkpoint.\n',
        }],
      })
      if (!tree?.sha) {
        throw new ReleaseCommandError('GitHub returned no release state tree')
      }
      const { data: commit } = await request<{ sha: string }>('POST', '/git/commits', {
        message: 'chore(release): initialize release checkpoints [skip ci]',
        tree: tree.sha,
        parents: [],
      })
      if (!commit?.sha) {
        throw new ReleaseCommandError('GitHub returned no release state commit')
      }
      try {
        await request('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha: commit.sha })
      }
      catch (creationError) {
        // A concurrent creator or lost response may have initialized the branch.
        try {
          await request('GET', `/git/ref/heads/${branch}`)
        }
        catch {
          throw creationError
        }
      }
    }
  }
  const content = JSON.stringify(state)
  const attempts = Math.max(1, options.retryAttempts ?? 3)
  const delay = Math.max(0, options.retryDelay ?? 1_000)
  const sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
  let error: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { data } = await request<{ content: { sha: string } }>('PUT', endpoint, {
        message: 'chore(release): checkpoint release lifecycle [skip ci]',
        branch,
        content: Buffer.from(content).toString('base64'),
        ...(revision ? { sha: revision } : {}),
      })
      if (!data?.content.sha) {
        throw new ReleaseCommandError('GitHub returned no release checkpoint revision')
      }
      return data.content.sha
    }
    catch (caught) {
      error = caught
      // A failed response may follow a committed write. Reconcile before retrying,
      // and never adopt a concurrent writer's revision to make our PUT succeed.
      const recovered = await readState(request, endpoint)
      if (recovered && JSON.stringify(recovered.value) === content) {
        return recovered.revision
      }
      if (recovered?.revision !== revision || !transient(caught) || attempt === attempts) {
        break
      }
      await sleep(delay * 2 ** (attempt - 1))
    }
  }
  throw new ReleaseCommandError(`Release checkpoint write failed or another publisher advanced it; retry after the other run finishes. ${error instanceof Error ? error.message : String(error)}`)
}

export function writeReleaseState(request: GitHubRequest, key: string, state: ReleaseLifecycleState, revision?: string, options?: ReleaseStateWriteOptions) {
  return writeState(request, statePath(key), state, revision, options)
}

export function writeAutomationState(request: GitHubRequest, key: string, value: unknown, revision?: string, options?: ReleaseStateWriteOptions) {
  return writeState(request, automationPath(key), value, revision, options)
}
