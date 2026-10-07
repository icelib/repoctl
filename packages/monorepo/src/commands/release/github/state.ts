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

export async function readReleaseState(request: GitHubRequest, key: string): Promise<ReleaseStateSnapshot | undefined> {
  try {
    const { data } = await request<{ sha: string, content: string }>('GET', `${statePath(key)}?ref=${branch}`)
    if (!data?.sha || !data.content) {
      throw new ReleaseCommandError('GitHub returned an invalid release checkpoint')
    }
    return { revision: data.sha, state: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')) as ReleaseLifecycleState }
  }
  catch (error) {
    if (missing(error)) {
      return undefined
    }
    throw error
  }
}

function transient(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error) || typeof error.status !== 'number') {
    return false
  }
  return error.status === 429 || error.status >= 500
}

export async function writeReleaseState(request: GitHubRequest, key: string, state: ReleaseLifecycleState, revision?: string, options: ReleaseStateWriteOptions = {}) {
  if (!revision) {
    try {
      await request('GET', `/git/ref/heads/${branch}`)
    }
    catch (error) {
      if (!missing(error)) {
        throw error
      }
      try {
        await request('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha: state.packages[0]?.target })
      }
      catch {
        // 并发创建或响应丢失时确认远端分支；读取失败不能视为创建成功。
        await request('GET', `/git/ref/heads/${branch}`)
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
      const { data } = await request<{ content: { sha: string } }>('PUT', statePath(key), {
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
      if (!transient(caught) || attempt === attempts) {
        break
      }
      await sleep(delay * 2 ** (attempt - 1))
    }
  }
  // PUT 采用文件 SHA 比较并交换；只有完全一致的远端内容才能证明丢失的响应已提交。
  const recovered = await readReleaseState(request, key)
  if (recovered && JSON.stringify(recovered.state) === content) {
    return recovered.revision
  }
  throw new ReleaseCommandError(`Release checkpoint write failed or another publisher advanced it; retry after the other run finishes. ${error instanceof Error ? error.message : String(error)}`)
}
