import type { DocsDeploymentPlan, DocsDeploymentTarget } from '@icebreakers/monorepo'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { docsManifest } from '../../../../src/commands/docs/manifest'
import { verifyDocsReadiness } from '../../../../src/commands/docs/readiness'

const plan: DocsDeploymentPlan = {
  schemaVersion: 1,
  repository: 'example/project',
  site: 'website',
  channel: 'stable',
  deploymentId: 'd'.repeat(64),
  sourceSha: 'a'.repeat(40),
  treeSha: 'b'.repeat(40),
  releaseId: 'c'.repeat(64),
  commits: [],
  packages: [],
  eligible: true,
  skipped: false,
  blockers: [],
}
const target: DocsDeploymentTarget = { deployScript: 'docs:deploy', url: 'https://docs.example.invalid/nested/', readiness: { timeoutMs: 5_000, requestTimeoutMs: 500 } }

let start: number

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

async function rejected(request: typeof fetch, reason: string, selection = plan) {
  const result = verifyDocsReadiness(target, selection, request, Date.now)
  const assertion = expect(result).rejects.toMatchObject({ reason })
  await vi.runAllTimersAsync()
  await assertion
  expect(Date.now()).toBeLessThanOrEqual(start + 5_000)
}

beforeEach(() => {
  start = Date.now()
})

it('waits through an old identity and requests the configured origin without credentials', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ ...docsManifest(plan), deploymentId: 'old' }))
    .mockResolvedValueOnce(Response.json(docsManifest(plan)))
  const result = verifyDocsReadiness(target, plan, request, Date.now)
  await vi.runAllTimersAsync()
  await result
  expect(request).toHaveBeenCalledTimes(2)
  expect(request.mock.calls[0]?.[0]).toBe('https://docs.example.invalid/.well-known/repoctl-deployment.json')
  expect(request.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store' })
  expect(request.mock.calls[0]?.[1]?.headers).toEqual({ 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache', 'Accept': 'application/json' })
})

it('does not accept a correct response completed after its total budget', async () => {
  let now = 0
  const request = vi.fn(async () => {
    now = 5_001
    return Response.json(docsManifest(plan))
  })
  await expect(verifyDocsReadiness(target, plan, request, () => now)).rejects.toMatchObject({ reason: 'request-timeout' })
  expect(request).toHaveBeenCalledOnce()
})

it.each(['schemaVersion', 'site', 'channel', 'deploymentId', 'sourceSha', 'treeSha', 'releaseId'])('rejects a different %s even with HTTP 200', async (field) => {
  await rejected(vi.fn(async () => Response.json({ ...docsManifest(plan), [field]: 'incorrect' })), 'identity-mismatch')
})

it('rejects release identity on a preview response', async () => {
  const { releaseId: _releaseId, ...preview } = { ...plan, channel: 'preview' as const }
  await rejected(vi.fn(async () => Response.json({ ...docsManifest(preview), releaseId: plan.releaseId })), 'identity-mismatch', preview)
})

it.each([
  ['invalid-json', () => new Response('<html>secret-response</html>')],
  ['invalid-json', () => new Response('{broken')],
  ['invalid-payload', () => Response.json(null)],
  ['invalid-payload', () => Response.json([])],
  ['response-too-large', () => new Response('x'.repeat(65_537))],
  ['http-status', () => new Response(null, { status: 204 })],
  ['http-status', () => new Response(null, { status: 302, headers: { Location: 'https://other.example.invalid' } })],
  ['http-status', () => new Response('secret-response', { status: 403 })],
  ['http-status', () => new Response('secret-response', { status: 429 })],
  ['http-status', () => new Response('secret-response', { status: 500 })],
] as const)('bounds and classifies %s without returning response bodies', async (reason, response) => {
  await rejected(vi.fn(async () => response()), reason)
})

it.each(['DNS', 'TLS'])('bounds %s failures without retaining transport messages', async (kind) => {
  const request = vi.fn(async () => {
    throw new Error(`${kind}: secret-token Authorization=secret`)
  })
  await rejected(request, 'network-error')
  expect(request.mock.calls.length).toBeLessThanOrEqual(4)
})

it.each(['headers', 'body'])('aborts hung %s and gives each retry a finite budget', async (kind) => {
  const signals: AbortSignal[] = []
  const cancel = vi.fn()
  const request: typeof fetch = vi.fn<typeof fetch>(async (_url, init) => {
    signals.push(init!.signal!)
    return kind === 'headers'
      ? new Promise<Response>(() => {})
      : new Response(new ReadableStream({ cancel }))
  })
  await rejected(request, 'request-timeout')
  expect(signals.length).toBeGreaterThan(0)
  expect(signals.every(signal => signal.aborted)).toBe(true)
  if (kind === 'body') {
    expect(cancel).toHaveBeenCalledTimes(signals.length)
  }
})
