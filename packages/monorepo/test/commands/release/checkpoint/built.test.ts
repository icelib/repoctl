import { GitHubApiError } from '@icebreakers/monorepo'
import { expect, it, vi } from 'vitest'
import { branch, client, initializationRequest, key, requests, response, source, state, stored } from './fixture'

it.each([{ packages: state.packages }, { packages: [] }])('initializes a checkpoint without source history for $packages.length packages', async ({ packages }) => {
  const checkpoint = { ...state, packages }
  const request = initializationRequest()
    .mockResolvedValueOnce(response({ object: { sha: 'checkpoint-commit' } }, 201))
    .mockResolvedValueOnce(response({ content: { sha: 'checkpoint-blob' } }, 201))
    .mockResolvedValueOnce(response(stored(checkpoint)))
  const github = client(request)

  await expect(github.writeReleaseState(key, checkpoint)).resolves.toBe('checkpoint-blob')
  await expect(github.readReleaseState(key)).resolves.toEqual({ revision: 'checkpoint-blob', state: checkpoint })
  const calls = requests(request)
  expect(calls.map(call => `${call.method} ${call.path}`)).toEqual([
    `GET /git/ref/heads/${branch}`,
    'POST /git/trees',
    'POST /git/commits',
    'POST /git/refs',
    `PUT /contents/.repoctl-release/${key}.json`,
    `GET /contents/.repoctl-release/${key}.json`,
  ])
  expect(calls[1]!.body).toEqual({
    tree: [{ path: '.repoctl-release/README.md', mode: '100644', type: 'blob', content: expect.stringContaining('Release checkpoints') }],
  })
  expect(calls[2]!.body).toEqual({
    message: expect.stringContaining('[skip ci]'),
    tree: 'checkpoint-tree',
    parents: [],
  })
  expect(calls[3]!.body).toEqual({ ref: `refs/heads/${branch}`, sha: 'checkpoint-commit' })
  expect(JSON.stringify(calls.filter(call => call.path.startsWith('/git/')))).not.toContain(source)
})

it('writes into an existing checkpoint branch without rebuilding or moving it', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ object: { sha: 'existing-commit' } }))
    .mockResolvedValueOnce(response({ content: { sha: 'checkpoint-blob' } }, 201))
  await expect(client(request).writeReleaseState(key, state)).resolves.toBe('checkpoint-blob')
  expect(requests(request).map(call => call.method)).toEqual(['GET', 'PUT'])
})

it('uses the existing checkpoint revision without initializing a branch', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ content: { sha: 'next-blob' } }))
  await expect(client(request).writeReleaseState(key, state, 'old-blob')).resolves.toBe('next-blob')
  expect(requests(request)).toEqual([{
    method: 'PUT',
    path: `/contents/.repoctl-release/${key}.json`,
    body: expect.objectContaining({ branch, sha: 'old-blob' }),
  }])
})

it.each(['concurrent initializer', 'lost response'])('recovers a %s only after finding the branch', async (scenario) => {
  const request = initializationRequest()
  if (scenario === 'lost response') {
    request.mockRejectedValueOnce(new TypeError('socket closed'))
  }
  else {
    request.mockResolvedValueOnce(response({ message: 'Reference already exists' }, 422))
  }
  request.mockResolvedValueOnce(response({ object: { sha: 'concurrent-commit' } }))
    .mockResolvedValueOnce(response({ content: { sha: 'checkpoint-blob' } }, 201))
  await expect(client(request).writeReleaseState(key, state)).resolves.toBe('checkpoint-blob')
  expect(requests(request).map(call => `${call.method} ${call.path}`).slice(3)).toEqual([
    'POST /git/refs',
    `GET /git/ref/heads/${branch}`,
    `PUT /contents/.repoctl-release/${key}.json`,
  ])
})

it.each([403, 422, 0])('preserves the ref creation error %s when reconciliation fails', async (status) => {
  const request = initializationRequest()
  if (status === 0) {
    request.mockRejectedValueOnce(new TypeError('socket closed'))
  }
  else {
    request.mockResolvedValueOnce(response({ message: 'Creation failed' }, status))
  }
  request.mockResolvedValueOnce(response({ message: 'Not Found' }, 404))
  await expect(client(request).writeReleaseState(key, state)).rejects.toMatchObject({
    name: GitHubApiError.name,
    status,
    message: expect.stringContaining('POST /git/refs'),
  })
  expect(requests(request).some(call => call.method === 'PUT')).toBe(false)
})

it.each(['tree', 'commit'])('stops when GitHub returns no %s SHA', async (resource) => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ message: 'Not Found' }, 404))
  if (resource === 'commit') {
    request.mockResolvedValueOnce(response({ sha: 'checkpoint-tree' }, 201))
  }
  request.mockResolvedValueOnce(response({}, 201))
  await expect(client(request).writeReleaseState(key, state)).rejects.toThrow(`no release state ${resource}`)
  expect(requests(request).some(call => call.path === '/git/refs' || call.method === 'PUT')).toBe(false)
})

it.each([401, 403, 500])('does not initialize a branch after lookup error %s', async (status) => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ message: 'Unavailable' }, status))
  await expect(client(request).writeReleaseState(key, state)).rejects.toMatchObject({ status })
  expect(requests(request).map(call => call.method)).toEqual(['GET'])
})
