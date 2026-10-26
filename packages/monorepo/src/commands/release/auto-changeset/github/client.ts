import type { AutoChangesetOptions } from '../types'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { readBounded } from '../../snapshot/prepared/github/client'

export function record(value: unknown, label = 'GitHub response'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`)
  }
  return value as Record<string, unknown>
}

export function positive(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Invalid ${label}.`)
  }
  return value
}

export function sha(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f\d]{40}$/u.test(value)) {
    throw new Error('Invalid GitHub commit or object SHA.')
  }
  return value
}

export function textValue(value: unknown, label: string) {
  if (typeof value !== 'string' || !value || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error(`Invalid ${label}.`)
  }
  return value
}

export function safePath(value: unknown) {
  const result = textValue(value, 'repository path')
  if (result.startsWith('/') || result.includes('\\') || result.includes(':')
    || result.split('/').some(part => !part || part === '.' || part.endsWith('.') || part.trimEnd() !== part)) {
    throw new Error('Unsafe repository path.')
  }
  return result
}

export function createGitHub(options: AutoChangesetOptions) {
  if (!/^[\w-]+\/[\w.-]+$/u.test(options.repository) || options.repository.split('/').some(value => ['.', '..'].includes(value))) {
    throw new Error('Auto changeset requires an owner/repository name.')
  }
  positive(options.pullRequest, 'pull request number')
  const token = options.token ?? (options.env ?? process.env)['GITHUB_TOKEN']
  if (!token) {
    throw new Error('Auto changeset requires GITHUB_TOKEN.')
  }
  const fetcher = options.fetch ?? globalThis.fetch
  const immutable = new Map<string, Promise<unknown>>()
  async function request(path: string, method: string, body?: unknown, optional = false, graph = false): Promise<unknown> {
    const response = await fetcher(graph ? 'https://api.github.com/graphql' : `https://api.github.com/repos/${options.repository}${path}`, {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
    if (optional && response.status === 404) {
      await response.body?.cancel()
      return undefined
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`GitHub auto changeset request failed: HTTP ${response.status}.`)
    }
    return JSON.parse(Buffer.from(await readBounded(response, 32 * 1024 * 1024)).toString('utf8'))
  }
  function json(path: string, method = 'GET', body?: unknown, optional = false): Promise<unknown> {
    if (method === 'GET' && /^\/git\/(?:blobs|trees|commits)\/[a-f\d]{40}(?:\?|$)/u.test(path)) {
      if (!immutable.has(path)) {
        immutable.set(path, request(path, method, body, optional))
      }
      return immutable.get(path)!
    }
    return request(path, method, body, optional)
  }
  async function graphql(query: string, variables: Record<string, unknown>) {
    const result = record(await request('', 'POST', { query, variables }, false, true), 'GitHub GraphQL response')
    if (result['errors'] !== undefined || !result['data']) {
      throw new Error('GitHub refused the conditional automatic changeset commit; re-plan after checking the branch head.')
    }
    return record(result['data'], 'GitHub GraphQL data')
  }
  async function list(path: string, field?: string, limit = 30) {
    const result: Record<string, unknown>[] = []
    let expectedTotal: number | undefined
    for (let page = 1; page <= limit; page++) {
      const response = await json(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
      const envelope = field ? record(response) : undefined
      const items = field ? envelope![field] : response
      if (envelope) {
        const total = envelope['total_count']
        if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 || (expectedTotal !== undefined && total !== expectedTotal)) {
          throw new Error('Incomplete or changing GitHub pagination metadata.')
        }
        expectedTotal = total
      }
      if (!Array.isArray(items) || items.length > 100) {
        throw new Error('Invalid paginated GitHub response.')
      }
      result.push(...items.map(item => record(item)))
      if (items.length < 100 || (expectedTotal !== undefined && result.length === expectedTotal)) {
        if (expectedTotal !== undefined && result.length !== expectedTotal) {
          throw new Error('Incomplete GitHub pagination.')
        }
        return result
      }
    }
    throw new Error('GitHub pagination limit exceeded; refusing an incomplete changeset.')
  }
  return { json, list, graphql }
}

export type AutoChangesetGitHub = ReturnType<typeof createGitHub>
