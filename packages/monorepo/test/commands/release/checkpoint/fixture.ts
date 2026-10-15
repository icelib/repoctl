import type { ReleaseLifecycleState } from '@icebreakers/monorepo'
import { Buffer } from 'node:buffer'
import { GitHubClient } from '@icebreakers/monorepo'
import { vi } from 'vitest'

export const branch = 'repoctl-release-state'
export const key = 'a'.repeat(64)
export const source = 'b'.repeat(40)
export const state: ReleaseLifecycleState = {
  schemaVersion: 1,
  writer: 'fixture-run',
  repository: 'acme/repo',
  candidates: [{ name: 'fixture', version: '1.0.1' }],
  packages: [{ name: 'fixture', version: '1.0.1', target: source }],
  accepted: [],
  npm: 'pending',
  metadata: [],
  hooks: {},
  complete: false,
}

export const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
export function stored(checkpoint = state) {
  return {
    sha: 'checkpoint-blob',
    content: Buffer.from(JSON.stringify(checkpoint)).toString('base64'),
  }
}
export function client(fetch: typeof globalThis.fetch) {
  return new GitHubClient({
    token: 'fixture-token',
    repository: 'acme/repo',
    retryAttempts: 1,
    fetch,
  })
}

export function initializationRequest() {
  return vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ message: 'Not Found' }, 404))
    .mockResolvedValueOnce(response({ sha: 'checkpoint-tree' }, 201))
    .mockResolvedValueOnce(response({ sha: 'checkpoint-commit' }, 201))
}

export function requests(fetch: ReturnType<typeof initializationRequest>) {
  return fetch.mock.calls.map(([url, init]) => ({
    method: init?.method,
    path: new URL(String(url)).pathname.replace('/repos/acme/repo', ''),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }))
}
