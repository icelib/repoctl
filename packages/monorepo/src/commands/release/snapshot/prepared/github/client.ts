import type { GitHubRecord, SnapshotGitHubOptions } from './types'
import { Buffer } from 'node:buffer'
import process from 'node:process'

export function record(value: unknown, label = 'GitHub response'): GitHubRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`)
  }
  return value as GitHubRecord
}

export function positive(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Invalid ${label}.`)
  }
  return value
}

export function sha(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f\d]{40}$/.test(value)) {
    throw new Error('Invalid GitHub source commit SHA.')
  }
  return value
}

export function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:sha256:)?[a-f\d]{64}$/.test(value)) {
    throw new Error('Invalid immutable artifact or workflow SHA256 digest.')
  }
  return `sha256:${value.replace(/^sha256:/, '')}`
}

export async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
  const length = response.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await response.body?.cancel()
    throw new Error('GitHub download exceeds its permitted size.')
  }
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('GitHub download has no response body.')
  }
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) {
        break
      }
      size += item.value.byteLength
      if (size > limit) {
        throw new Error('GitHub download exceeds its permitted size.')
      }
      chunks.push(item.value)
    }
  }
  finally {
    await reader.cancel()
  }
  return Buffer.concat(chunks, size)
}

export function createSnapshotGitHub(options: SnapshotGitHubOptions) {
  if (!/^[\w-]+\/[\w.-]+$/.test(options.repository) || options.repository.split('/').some(value => ['.', '..'].includes(value))) {
    throw new Error('Snapshot verification requires an owner/repository name.')
  }
  const token = options.token ?? process.env['GITHUB_TOKEN']
  if (!token) {
    throw new Error('Snapshot verification requires GITHUB_TOKEN with read access to Actions and pull requests.')
  }
  const fetcher = options.fetch ?? globalThis.fetch
  const root = `https://api.github.com/repos/${options.repository}`
  async function response(path: string) {
    const result = await fetcher(`${root}${path}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    })
    if (!result.ok && result.status !== 302) {
      await result.body?.cancel()
      throw new Error(`GitHub snapshot verification failed: HTTP ${result.status}.`)
    }
    return result
  }
  async function binary(path: string, limit: number) {
    let result = await response(path)
    if (result.status === 302) {
      const location = new URL(result.headers.get('location') ?? '')
      await result.body?.cancel()
      if (location.protocol !== 'https:' || location.username || location.password || location.hash) {
        throw new Error('GitHub returned an unsafe download redirect.')
      }
      // Signed storage URLs are credentials themselves; neither log them nor forward the API token.
      result = await fetcher(location, { redirect: 'error', signal: AbortSignal.timeout(60_000) })
      if (!result.ok) {
        await result.body?.cancel()
        throw new Error(`GitHub artifact download failed: HTTP ${result.status}.`)
      }
    }
    return readBounded(result, limit)
  }
  async function json(path: string): Promise<unknown> {
    const result = await response(path)
    if (result.status === 302) {
      await result.body?.cancel()
      throw new Error('Unexpected GitHub API redirect.')
    }
    return JSON.parse(Buffer.from(await readBounded(result, 16 * 1024 * 1024)).toString('utf8'))
  }
  async function list(path: string, field?: string): Promise<GitHubRecord[]> {
    const values: GitHubRecord[] = []
    for (let page = 1; page <= 20; page++) {
      const value = await json(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
      const items = field ? record(value)[field] : value
      if (!Array.isArray(items)) {
        throw new TypeError('Invalid paginated GitHub response.')
      }
      values.push(...items.map(item => record(item)))
      if (items.length < 100) {
        return values
      }
    }
    throw new Error('GitHub snapshot evidence exceeds the pagination limit.')
  }
  return { json, binary, list }
}

export type SnapshotGitHub = ReturnType<typeof createSnapshotGitHub>
