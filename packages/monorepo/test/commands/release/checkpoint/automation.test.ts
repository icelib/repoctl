import { Buffer } from 'node:buffer'
import { expect, it, vi } from 'vitest'
import { client, requests, response } from './fixture'

it('stores automation state in a separate namespace on the existing state branch', async () => {
  const value = { version: 1, release: 'known-release' }
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ content: { sha: 'next-blob' } }))
    .mockResolvedValueOnce(response({ sha: 'next-blob', content: Buffer.from(JSON.stringify(value)).toString('base64') }))
  const github = client(request)
  await expect(github.writeAutomationState('docs/guide/stable', value, 'old-blob')).resolves.toBe('next-blob')
  await expect(github.readAutomationState('docs/guide/stable')).resolves.toEqual({ revision: 'next-blob', value })
  expect(requests(request)[0]).toMatchObject({
    method: 'PUT',
    path: '/contents/.repoctl-automation/docs/guide/stable.json',
    body: { sha: 'old-blob', branch: 'repoctl-release-state' },
  })
})

it.each(['../release', 'docs/a/../stable', 'docs/a/stable/extra', '/docs/a/stable', 'releases/not-a-hash', 'docs/a?ref=main/stable'])('rejects unsafe automation key %s before requesting GitHub', async (key) => {
  const request = vi.fn<typeof fetch>()
  const github = client(request)
  await expect(github.readAutomationState(key)).rejects.toThrow('Invalid automation state key')
  await expect(github.writeAutomationState(key, {})).rejects.toThrow('Invalid automation state key')
  expect(request).not.toHaveBeenCalled()
})

it('does not adopt a concurrent automation writer revision after a conflicting update', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ message: 'Conflict' }, 409))
    .mockResolvedValueOnce(response({ sha: 'another-blob', content: Buffer.from(JSON.stringify({ generation: 2 })).toString('base64') }))
  await expect(client(request).writeAutomationState('docs/guide/stable', { generation: 1 }, 'old-blob')).rejects.toThrow('another publisher advanced')
  expect(requests(request).filter(call => call.method === 'PUT')).toHaveLength(1)
})

it('resolves the current main head through the authenticated API', async () => {
  const sha = 'd'.repeat(40)
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ object: { type: 'commit', sha } }))
  await expect(client(request).readBranchHead('main')).resolves.toBe(sha)
  expect(requests(request)[0]).toMatchObject({ method: 'GET', path: '/git/ref/heads/main' })
})

it('rejects a missing or malformed branch head instead of trusting an old checkout', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ object: { type: 'commit', sha: 'main' } }))
  await expect(client(request).readBranchHead('main')).rejects.toThrow('Cannot resolve branch head')
})
