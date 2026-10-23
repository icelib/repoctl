import { deployDocs, planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanup } from '../helpers'
import { api, nativeFixture, otherVersion, versionId } from './helpers'

afterEach(cleanup)

it.each([403, 404, 429, 500])('fails closed on HTTP %s and excludes provider messages from diagnostics', async (status) => {
  const h = await nativeFixture()
  h.request.mockImplementation(async () => Response.json({ success: false, errors: [{ code: 10000, message: 'secret-token' }] }, { status }))
  await expect(deployDocs(h.options)).rejects.toThrow(`HTTP ${status}`)
  await expect(deployDocs(h.options)).rejects.not.toThrow('secret-token')
  expect(h.calls).toEqual([])
})

it('permits a first deployment only after the Worker-specific 404 + 10007', async () => {
  const h = await nativeFixture()
  const original = h.request.getMockImplementation()!
  h.request.mockImplementation(async url => h.state.uploadCount === 0
    ? Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 })
    : original(url))
  expect((await deployDocs(h.options)).versionId).toBe(versionId)
  expect(h.state.uploadCount).toBe(1)
})

it.each([
  {},
  { deployments: [] },
  { deployments: [{ created_on: 'invalid', strategy: 'percentage', versions: [{ version_id: versionId, percentage: 100 }] }] },
  { deployments: [{ created_on: '2026-02-30T00:00:00Z', strategy: 'percentage', versions: [{ version_id: versionId, percentage: 100 }] }] },
  { deployments: [{ created_on: '2026-10-23T00:00:00Z', strategy: 'percentage', versions: [{ version_id: versionId, percentage: '100' }] }] },
  { deployments: [{ created_on: '2026-10-23T00:00:00Z', strategy: 'percentage', versions: [{ version_id: 'a'.repeat(36), percentage: 100 }] }] },
  { deployments: [{ created_on: '2026-10-23T00:00:00Z', strategy: 'percentage', versions: [{ version_id: versionId, percentage: 50 }, { version_id: otherVersion, percentage: 50 }] }] },
])('rejects ambiguous active deployment data before effects: %o', async (result) => {
  const h = await nativeFixture()
  h.request.mockImplementation(async () => api(result))
  await expect(deployDocs(h.options)).rejects.toThrow(/Cloudflare/)
  expect(h.calls).toEqual([])
})

it.each(['network', 'json', 'oversized', 'envelope', 'version'])('does not convert %s failures into missing Worker or new upload', async (kind) => {
  const h = await nativeFixture()
  if (kind === 'version') {
    h.request.mockResolvedValueOnce(api({ deployments: [{ created_on: '2026-10-23T00:00:00Z', strategy: 'percentage', versions: [{ version_id: versionId, percentage: 100 }] }] }))
    h.request.mockResolvedValueOnce(api({ id: otherVersion, annotations: {} }))
  }
  else {
    h.request.mockImplementation(async () => {
      if (kind === 'network') {
        throw new Error('secret-token')
      }
      if (kind === 'envelope') {
        return Response.json([])
      }
      return new Response(kind === 'json' ? '{broken' : 'x'.repeat(1_048_577))
    })
  }
  await expect(deployDocs(h.options)).rejects.toThrow(/Cloudflare/)
  expect(h.calls).toEqual([])
})

it('uses the first API entry even when history has a later timestamp and the desired identity', async () => {
  const h = await nativeFixture()
  const plan = await planDocsDeployment(h.options)
  const original = h.request.getMockImplementation()!
  h.request.mockImplementation(async (input) => {
    if (h.state.uploadCount) {
      return original(input)
    }
    if (String(input).endsWith('/deployments')) {
      return api({ deployments: [
        { created_on: '2026-10-22T00:00:00Z', strategy: 'percentage', versions: [{ version_id: versionId, percentage: 100 }] },
        { created_on: '2026-10-23T00:00:00Z', strategy: 'percentage', versions: [{ version_id: otherVersion, percentage: 100 }] },
      ] })
    }
    return api({ id: String(input).endsWith(otherVersion) ? otherVersion : versionId, annotations: { 'workers/message': String(input).endsWith(otherVersion) ? `repoctl-docs:${plan.deploymentId}` : 'previous' } })
  })
  expect((await deployDocs(h.options)).versionId).toBe(versionId)
  expect(h.state.uploadCount).toBe(1)
  expect(h.request.mock.calls.some(([url]) => String(url).endsWith(otherVersion))).toBe(false)
})

it('reconciles the exact desired active version without uploading', async () => {
  const h = await nativeFixture()
  const plan = await planDocsDeployment(h.options)
  h.state.message = `repoctl-docs:${plan.deploymentId}`
  expect((await deployDocs(h.options)).versionId).toBe(versionId)
  expect(h.calls).toHaveLength(2)
  expect(h.state.uploadCount).toBe(0)
})
