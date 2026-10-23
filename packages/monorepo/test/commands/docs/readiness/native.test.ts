import { deployDocs, planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { docsManifest } from '../../../../src/commands/docs/manifest'
import { api, nativeFixture, otherVersion, versionId } from '../cloudflare/helpers'
import { cleanup, expectDocsFailure } from '../helpers'

afterEach(cleanup)

async function nativeReadiness() {
  const h = await nativeFixture()
  h.site.stable.readiness = { timeoutMs: 1_000, requestTimeoutMs: 500 }
  const plan = await planDocsDeployment(h.options)
  const provider = h.request.getMockImplementation()!
  return { ...h, plan, provider }
}

it('confirms the exact saved native version again after public readiness succeeds', async () => {
  const h = await nativeReadiness()
  let publicReady = false
  let finalReconciliations = 0
  h.request.mockImplementation(async (url, init) => {
    if (String(url).startsWith('https://docs.example.invalid/')) {
      publicReady = true
      expect(init?.headers).not.toHaveProperty('Authorization')
      return Response.json(docsManifest(h.plan))
    }
    if (publicReady && String(url).endsWith('/deployments')) {
      finalReconciliations++
    }
    return h.provider(url, init)
  })
  expect((await deployDocs(h.options)).status).toBe('deployed')
  expect(finalReconciliations).toBe(1)
  expect(h.state.uploadCount).toBe(1)
})

it('detects native traffic cutover during HTTP verification without advancing current', async () => {
  const h = await nativeReadiness()
  h.request.mockImplementation(async (url, init) => {
    if (String(url).startsWith('https://docs.example.invalid/')) {
      h.state.versionId = otherVersion
      return Response.json(docsManifest(h.plan))
    }
    return h.provider(url, init)
  })
  await expectDocsFailure(deployDocs(h.options), 'finalize', 'saved-version-inactive')
  expect(h.store.records.get('docs/website/stable')?.value).toMatchObject({ pending: { phase: 'verifying', receipt: { versionId } } })
  expect(h.store.records.get('docs/website/stable')?.value).not.toHaveProperty('current')
  expect(h.state.uploadCount).toBe(1)
})

it.each(['missing', 'changed', 'mixed', 'different-identity', 'network'])('never uploads or rebuilds when a saved native receipt is %s', async (kind) => {
  const h = await nativeReadiness()
  h.request.mockImplementation(async (url, init) => String(url).startsWith('https://docs.example.invalid/')
    ? Response.json({ stale: true })
    : h.provider(url, init))
  await expect(deployDocs(h.options)).rejects.toMatchObject({ report: { failedStage: 'readiness', resumablePhase: 'verifying' } })
  const calls = h.calls.length
  h.request.mockImplementation(async (url, init) => {
    if (kind === 'network') {
      throw new Error('Authorization secret-token Cookie: secret')
    }
    if (String(url).endsWith('/deployments')) {
      if (kind === 'missing') {
        return Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 })
      }
      return api({ deployments: [{ created_on: '2026-10-23T00:00:00Z', strategy: 'percentage', versions: kind === 'mixed'
        ? [{ version_id: versionId, percentage: 50 }, { version_id: otherVersion, percentage: 50 }]
        : [{ version_id: kind === 'changed' ? otherVersion : versionId, percentage: 100 }] }] })
    }
    if (String(url).includes('/versions/')) {
      return api({ id: kind === 'changed' ? otherVersion : versionId, annotations: { 'workers/message': kind === 'different-identity' ? 'repoctl-docs:other' : `repoctl-docs:${h.plan.deploymentId}` } })
    }
    return h.provider(url, init)
  })
  await expectDocsFailure(deployDocs({ ...h.options, env: { ...h.options.env, GITHUB_RUN_ID: 'new-run' } }), 'provider', kind === 'network' ? 'provider-network-failed' : kind === 'mixed' ? 'provider-traffic-ambiguous' : 'saved-version-inactive')
  expect(h.calls).toHaveLength(calls)
  expect(h.state.uploadCount).toBe(1)
  expect(h.store.records.get('docs/website/stable')?.value).toMatchObject({ pending: { phase: 'verifying', receipt: { versionId } } })
})

it('resumes native readiness from the exact receipt and finishes without another source install/build/upload', async () => {
  const h = await nativeReadiness()
  let ready = false
  h.request.mockImplementation(async (url, init) => String(url).startsWith('https://docs.example.invalid/')
    ? Response.json(ready ? docsManifest(h.plan) : { stale: true })
    : h.provider(url, init))
  await expect(deployDocs(h.options)).rejects.toMatchObject({ report: { failedStage: 'readiness' } })
  const calls = h.calls.length
  ready = true
  const result = await deployDocs({ ...h.options, env: { ...h.options.env, GITHUB_RUN_ID: 'retry' } })
  expect(result.versionId).toBe(versionId)
  expect(h.calls).toHaveLength(calls)
  expect(h.state.uploadCount).toBe(1)
})
