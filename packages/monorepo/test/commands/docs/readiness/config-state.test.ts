import { deployDocs, planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fixture } from '../helpers'
import { readinessFixture, scriptRunner } from './helpers'

afterEach(cleanup)

it.each([
  { timeoutMs: 0 },
  { timeoutMs: -1 },
  { timeoutMs: 1.5 },
  { timeoutMs: 600_001 },
  { timeoutMs: Number.POSITIVE_INFINITY },
  { requestTimeoutMs: 0 },
  { requestTimeoutMs: 30_001 },
  { requestTimeoutMs: Number.NaN },
  { unknown: 10 },
])('rejects invalid readiness policy %o during read-only planning', async (readiness) => {
  const h = await fixture()
  Object.assign(h.options.config!.sites!['website']!.stable, { readiness })
  await expect(planDocsDeployment(h.options)).rejects.toThrow()
  expect(h.store.writes).toEqual([])
})

it.each([undefined, 'http://docs.example.invalid', 'https://user:password@docs.example.invalid', 'https://docs.example.invalid?token=secret', 'https://docs.example.invalid#fragment', 'invalid'])('requires an explicit safe HTTPS URL for readiness: %s', async (url) => {
  const h = await fixture()
  const target = h.options.config!.sites!['website']!.stable
  target.readiness = {}
  if (url === undefined) {
    delete target.url
  }
  else {
    target.url = url
  }
  await expect(planDocsDeployment(h.options)).rejects.toThrow(url === 'invalid' ? /Documentation URLs must use http or https/ : /HTTPS/)
  expect(h.store.writes).toEqual([])
})

it('does not materialize readiness defaults or request public HTTP for a legacy script target', async () => {
  const h = await fixture()
  const config = structuredClone(h.options.config)
  const plan = await planDocsDeployment(h.options)
  const request = vi.fn(async () => {
    throw new Error('network must not run')
  })
  const process = scriptRunner()
  const result = await deployDocs({ ...h.options, spawn: process.spawn, fetch: request })
  expect(result.plan.deploymentId).toBe(plan.deploymentId)
  expect(h.options.config).toEqual(config)
  expect(result.report?.stages).toContainEqual(expect.objectContaining({ stage: 'readiness', status: 'skipped', reason: 'not-required' }))
  expect(process.calls).toHaveLength(3)
  expect(request).not.toHaveBeenCalled()
})

it.each([
  ['missing receipt', (pending: Record<string, unknown>) => { delete pending['receipt'] }],
  ['empty receipt', (pending: Record<string, unknown>) => { pending['receipt'] = {} }],
  ['invalid version', (pending: Record<string, unknown>) => { pending['receipt'] = { versionId: '' } }],
  ['credential URL', (pending: Record<string, unknown>) => { pending['receipt'] = { versionId: 'v', url: 'https://user:secret@docs.example.invalid' } }],
  ['invalid URL', (pending: Record<string, unknown>) => { pending['receipt'] = { versionId: 'v', url: 'javascript:alert(1)' } }],
  ['extra receipt data', (pending: Record<string, unknown>) => { pending['receipt'] = { versionId: 'v', token: 'secret' } }],
  ['missing readiness', (pending: Record<string, unknown>) => {
    const snapshot = pending['snapshot'] as { config: { stable: { readiness?: unknown } } }
    delete snapshot.config.stable.readiness
  }],
  ['unknown phase', (pending: Record<string, unknown>) => { pending['phase'] = 'verified' }],
  ['array deploying phase without receipt', (pending: Record<string, unknown>) => {
    pending['phase'] = ['deploying']
    delete pending['receipt']
  }],
  ['array verifying phase without receipt', (pending: Record<string, unknown>) => {
    pending['phase'] = ['verifying']
    delete pending['receipt']
  }],
])('fails closed on persisted verifying state with %s', async (_label, corrupt) => {
  const h = await readinessFixture()
  h.request.mockImplementation(async () => Response.json({ old: true }))
  await expect(deployDocs(h.options)).rejects.toMatchObject({ report: { resumablePhase: 'verifying' } })
  const checkpoint = h.store.records.get('docs/website/stable')!
  corrupt((checkpoint.value as Record<string, unknown>)['pending'] as Record<string, unknown>)
  const saved = structuredClone(checkpoint)
  const writes = h.store.writes.length
  const process = scriptRunner()
  await expect(planDocsDeployment(h.options)).rejects.toThrow()
  await expect(deployDocs({ ...h.options, spawn: process.spawn })).rejects.toMatchObject({ report: { failedStage: 'plan' } })
  expect(process.calls).toEqual([])
  expect(h.store.writes).toHaveLength(writes)
  expect(h.store.records.get('docs/website/stable')).toEqual(saved)
})
