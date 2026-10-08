import type { ReleaseLifecycleState } from '@icebreakers/monorepo'
import { Buffer } from 'node:buffer'
import { GitHubClient } from '@icebreakers/monorepo'
import { expect, it, vi } from 'vitest'

const target = '1'.repeat(40)
const key = 'a'.repeat(64)
const state: ReleaseLifecycleState = {
  schemaVersion: 1,
  writer: 'writer-a',
  repository: 'acme/repo',
  candidates: [{ name: 'a', version: '1.0.0' }],
  packages: [{ name: 'a', version: '1.0.0', target }],
  accepted: [],
  npm: 'pending',
  metadata: [],
  hooks: {},
  complete: false,
}
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const stored = (value = state) => ({ sha: 'revision', content: Buffer.from(JSON.stringify(value)).toString('base64') })
const client = (fetch: typeof globalThis.fetch) => new GitHubClient({ token: 'test-token', repository: 'acme/repo', fetch, sleep: async () => {}, retryAttempts: 2 })

it('rechecks a checkpoint PUT with a lost response and accepts only identical content', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ object: { sha: target } }))
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce(response(stored()))
  await expect(client(request).writeReleaseState(key, state)).resolves.toBe('revision')
  expect(request.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
})

it('retries a transient checkpoint failure before giving up', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ object: { sha: target } }))
    .mockResolvedValueOnce(response({ message: 'Internal Server Error' }, 500))
    .mockResolvedValueOnce(response({ message: 'not found' }, 404))
    .mockResolvedValueOnce(response({ content: { sha: 'revision' } }, 201))
  await expect(client(request).writeReleaseState(key, state)).resolves.toBe('revision')
  expect(request.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(2)
})

it.each([429, 500, 503])('accepts a committed checkpoint after HTTP %s without another PUT', async (status) => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ message: 'response failed' }, status))
    .mockResolvedValueOnce(response(stored()))
  await expect(client(request).writeReleaseState(key, state, 'old-revision')).resolves.toBe('revision')
  expect(request.mock.calls.map(([, init]) => init?.method)).toEqual(['PUT', 'GET'])
})

it('retries a transport failure only after confirming the original revision is unchanged', async () => {
  const request = vi.fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError('socket closed'))
    .mockResolvedValueOnce(response({ ...stored({ ...state, npm: 'running' }), sha: 'old-revision' }))
    .mockResolvedValueOnce(response({ content: { sha: 'revision' } }))
  await expect(client(request).writeReleaseState(key, state, 'old-revision')).resolves.toBe('revision')
  expect(request.mock.calls.map(([, init]) => init?.method)).toEqual(['PUT', 'GET', 'PUT'])
  expect(request.mock.calls.filter(([, init]) => init?.method === 'PUT')
    .map(([, init]) => JSON.parse(String(init?.body)).sha)).toEqual(['old-revision', 'old-revision'])
})

it('bounds retries when the checkpoint remains unchanged', async () => {
  const request = vi.fn<typeof fetch>()
    .mockImplementation(async (_url, init) => init?.method === 'PUT'
      ? response({ message: 'Internal Server Error' }, 500)
      : response({ ...stored({ ...state, npm: 'running' }), sha: 'old-revision' }))
  await expect(client(request).writeReleaseState(key, state, 'old-revision')).rejects.toThrow('checkpoint write failed')
  expect(request.mock.calls.map(([, init]) => init?.method)).toEqual(['PUT', 'GET', 'PUT', 'GET'])
})

it.each([0, 401, 403, 409, 422, 429, 500])('stops when another writer advances the checkpoint after status %s', async (status) => {
  const request = vi.fn<typeof fetch>()
  if (status === 0) {
    request.mockRejectedValueOnce(new TypeError('response lost'))
  }
  else {
    request.mockResolvedValueOnce(response({ message: 'write failed' }, status))
  }
  request.mockResolvedValueOnce(response(stored({ ...state, writer: 'writer-b' })))
  await expect(client(request).writeReleaseState(key, state, 'old-revision')).rejects.toThrow('another publisher advanced')
  expect(request.mock.calls.map(([, init]) => init?.method)).toEqual(['PUT', 'GET'])
})

it('does not retry a PUT when the reconciliation read fails', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ message: 'Internal Server Error' }, 500))
    .mockResolvedValue(response({ message: 'unavailable' }, 503))
  await expect(client(request).writeReleaseState(key, state, 'old-revision')).rejects.toThrow()
  expect(request.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
})

it('does not mistake a concurrent checkpoint writer for its own lost response', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ message: 'conflict' }, 409))
    .mockResolvedValueOnce(response(stored({ ...state, writer: 'writer-b' })))
  await expect(client(request).writeReleaseState(key, state, 'old-revision')).rejects.toThrow('another publisher advanced')
  const put = JSON.parse(String(request.mock.calls[0]![1]!.body))
  expect(put.sha).toBe('old-revision')
})

it('creates the journal branch and first checkpoint before publishing', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ message: 'not found' }, 404))
    .mockResolvedValueOnce(response({ object: { sha: target } }, 201))
    .mockResolvedValueOnce(response({ content: { sha: 'revision' } }, 201))
  await expect(client(request).writeReleaseState(key, state)).resolves.toBe('revision')
  expect(JSON.parse(String(request.mock.calls[1]![1]!.body))).toEqual({ ref: 'refs/heads/repoctl-release-state', sha: target })
})

it.each([401, 403, 429, 500])('does not treat checkpoint lookup %s as missing', async (status) => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(response({ message: 'failure' }, status))
  await expect(client(request).readReleaseState(key)).rejects.toThrow()
  expect(request.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
})

it('peels annotated tags and rejects targets from a later CI commit', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ object: { type: 'tag', sha: 'annotation' } }))
    .mockResolvedValueOnce(response({ object: { type: 'commit', sha: target } }))
  await expect(client(request).ensureTag({ tag: 'a@1.0.0', target })).resolves.toBeUndefined()
  const conflict = vi.fn<typeof fetch>().mockResolvedValue(response({ object: { type: 'commit', sha: '2'.repeat(40) } }))
  await expect(client(conflict).ensureTag({ tag: 'a@1.0.0', target })).rejects.toThrow('Tag target conflict')
  expect(conflict).toHaveBeenCalledTimes(1)
})

it('rechecks tag creation after a lost response without another POST', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ message: 'not found' }, 404))
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce(response({ object: { type: 'commit', sha: target } }))
  await expect(client(request).ensureTag({ tag: 'a@1.0.0', target })).resolves.toBeUndefined()
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

it('rechecks release creation after malformed successful JSON instead of issuing another POST', async () => {
  const release = { id: 1, tag_name: 'a@1.0.0', html_url: 'https://example.test/release' }
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ message: 'not found' }, 404))
    .mockResolvedValueOnce(new Response('{', { status: 201 }))
    .mockResolvedValueOnce(response(release))
  await expect(client(request).ensureRelease({ tag: 'a@1.0.0', target })).resolves.toEqual(release)
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})
