import { describe, expect, it } from 'vitest'
import { requestJson } from '../../../../src/commands/release/npmmirror/http'
import { harness } from './fixture'

describe('npmmirror bounded HTTP client', () => {
  it.each([429, 503])('respects Retry-After and recovers from HTTP %s', async (status) => {
    let attempts = 0
    const h = harness(() => attempts++ === 0
      ? new Response('temporarily unavailable', { status, headers: { 'retry-after': '2' } })
      : Response.json({ ok: true }))
    expect(await requestJson('https://example.test', { ...h.runtime, deadline: 10_000 })).toEqual({ ok: true })
    expect(h.fetch).toHaveBeenCalledTimes(2)
    expect(h.elapsed()).toBe(2000)
  })

  it('makes no more than three attempts on network errors', async () => {
    const h = harness(() => {
      throw new Error('connection lost')
    })
    await expect(requestJson('https://example.test', { ...h.runtime, deadline: 10_000 })).rejects.toThrow('connection lost')
    expect(h.fetch).toHaveBeenCalledTimes(3)
    expect(h.elapsed()).toBe(3000)
  })

  it.each([401, 403, 404, 422])('does not retry HTTP %s', async (status) => {
    const h = harness(() => new Response('rejected', { status }))
    await expect(requestJson('https://example.test', { ...h.runtime, deadline: 10_000 })).rejects.toThrow(`HTTP ${status}`)
    expect(h.fetch).toHaveBeenCalledOnce()
  })

  it('caps Retry-After by the shared deadline', async () => {
    const h = harness(() => new Response('rate limit', { status: 429, headers: { 'retry-after': '60' } }))
    await expect(requestJson('https://example.test', { ...h.runtime, deadline: 1000 })).rejects.toThrow('timed out')
    expect(h.elapsed()).toBe(1000)
    expect(h.fetch).toHaveBeenCalledOnce()
  })

  it('keeps response-body reads inside the request timeout', async () => {
    const h = harness((_url, init) => new Response(new ReadableStream({
      start(controller) {
        init.signal?.addEventListener('abort', () => controller.error(new Error('body timeout')), { once: true })
      },
    })))
    await expect(requestJson('https://example.test', { ...h.runtime, deadline: 20 })).rejects.toThrow('timed out')
    expect(h.elapsed()).toBe(20)
  })

  it('rejects a successful HTTP response containing invalid JSON', async () => {
    const h = harness(() => new Response('<html>gateway</html>'))
    await expect(requestJson('https://example.test', { ...h.runtime, deadline: 1000 })).rejects.toThrow('Invalid JSON')
    expect(h.fetch).toHaveBeenCalledOnce()
  })
})
