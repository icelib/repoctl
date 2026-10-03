import { afterEach, expect, it, vi } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist
import { checkTemplateDrift, formatTemplateDriftReport, hasTemplateDriftIssues } from '../../../dist/index.mjs'
import { fixture } from './fixtures'

afterEach(() => vi.unstubAllGlobals())

it('uses only a verified explicitly requested remote response as newer-version evidence', async (t) => {
  const f = await fixture(t)
  const fetch = vi.fn(async () => new Response(JSON.stringify({ name: '@icebreakers/monorepo-templates', version: '3.0.0' })))
  vi.stubGlobal('fetch', fetch)
  const report = await checkTemplateDrift(f.cwd, { remote: true })
  expect(report.evidence).toMatchObject({ kind: 'remote', status: 'available', version: '3.0.0' })
  expect(report.owners[0]).toMatchObject({ version: { status: 'newer' }, local: 'unchanged' })
  expect(fetch).toHaveBeenCalledOnce()
})

it.for(['network', 'http', 'identity', 'version', 'uncomparable'] as const)('keeps %s remote failures unavailable and strict failures', async (mode, t) => {
  const f = await fixture(t)
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (mode === 'network') {
      throw new Error('Registry unavailable')
    }
    if (mode === 'http') {
      return new Response('Busy', { status: 503 })
    }
    return new Response(JSON.stringify({ name: mode === 'identity' ? 'unrelated' : '@icebreakers/monorepo-templates', version: mode === 'version' ? 'latest' : mode === 'uncomparable' ? '999999999999999999999.0.0' : '9.0.0' }))
  }))
  const report = await checkTemplateDrift(f.cwd, { remote: true })
  expect(report.evidence).toMatchObject({ kind: 'remote', status: 'unavailable' })
  expect(report.owners[0]).toMatchObject({ version: { status: 'unknown' }, local: 'unchanged' })
  expect(hasTemplateDriftIssues(report, true)).toBe(true)
  expect(formatTemplateDriftReport(report)).toContain('Supply an extracted template package')
})
