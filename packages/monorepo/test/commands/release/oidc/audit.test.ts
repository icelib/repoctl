import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { auditReleaseOidc } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanupReleaseTempRoots } from '../../release-fixtures'
import { claims, env, exchangeToken, idToken, json, mockFetch, requestToken, tokenFor, workspace } from './fixtures'

afterEach(cleanupReleaseTempRoots)

it('audits sorted public child candidates against npm with the current identity and no saved secrets', async () => {
  const cwd = await workspace(['z', '@scope/a'])
  const fetcher = mockFetch()
  const report = await auditReleaseOidc({ cwd, env, fetch: fetcher })
  expect(report).toMatchObject({ schemaVersion: 1, ok: true, identity: claims, results: [
    { package: '@scope/a', status: 201, ok: true },
    { package: 'z', status: 201, ok: true },
  ] })
  expect(report.hints.join(' ')).toContain('does not complete the first successful publish')
  const [request, ...exchanges] = fetcher.mock.calls
  expect(new URL(String(request![0])).searchParams.get('audience')).toBe('npm:registry.npmjs.org')
  expect(new URL(String(request![0])).searchParams.get('existing')).toBe('1')
  expect(request![1]?.headers).toEqual({ Authorization: `Bearer ${requestToken}` })
  expect(String(exchanges[0]![0])).toBe('https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/%40scope%2Fa')
  for (const [, options] of exchanges) {
    expect(options).toMatchObject({ method: 'POST', redirect: 'error', body: '', headers: { Authorization: `Bearer ${idToken}` } })
    expect(options?.signal).toBeInstanceOf(AbortSignal)
  }
  const output = JSON.stringify(report)
  for (const secret of [requestToken, idToken, exchangeToken]) {
    expect(output).not.toContain(secret)
  }
})

it.each([
  { iss: 'https://other.example' },
  { aud: 'other' },
  { repository: 'other/repo' },
  { workflow_ref: 'acme/repo/.github/workflows/other.yml@refs/heads/main' },
  { runner_environment: 'self-hosted' },
])('blocks identity mismatch before npm requests: %j', async (mismatch) => {
  const fetcher = mockFetch(undefined, { value: tokenFor({ ...claims, ...mismatch }) })
  await expect(auditReleaseOidc({ cwd: await workspace(), env, fetch: fetcher })).rejects.toThrow('does not match')
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it.each([null, [], { value: '' }, { value: 'not-a-jwt' }])('rejects malformed identity responses: %j', async (identity) => {
  const fetcher = mockFetch(undefined, identity)
  await expect(auditReleaseOidc({ cwd: await workspace(), env, fetch: fetcher })).rejects.toThrow(/missing|parsed/)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('requires current workflow identifiers and OIDC permission', async () => {
  const cwd = await workspace()
  const fetcher = mockFetch()
  for (const key of Object.keys(env)) {
    await expect(auditReleaseOidc({ cwd, env: { ...env, [key]: '' }, fetch: fetcher })).rejects.toThrow('id-token: write')
  }
  expect(fetcher).not.toHaveBeenCalled()
})

it('continues all packages after 404, invalid JSON, missing token and network failures', async () => {
  const cwd = await workspace(['e-ok', 'd-network', 'c-missing', 'b-json', 'a-404'])
  const fetcher = mockFetch((name) => {
    if (name === 'a-404') {
      return json({ message: 'OIDC token exchange error - package not found', body: { message: 'less useful' } }, 404)
    }
    if (name === 'b-json') {
      return new Response('invalid JSON', { status: 503 })
    }
    if (name === 'c-missing') {
      return json({ token: '' })
    }
    if (name === 'd-network') {
      throw new Error(`network exception with ${idToken} ${requestToken}`)
    }
    return json({ token: exchangeToken })
  })
  const report = await auditReleaseOidc({ cwd, env, fetch: fetcher })
  expect(report.ok).toBe(false)
  expect(report.results).toEqual([
    { package: 'a-404', status: 404, ok: false, message: 'OIDC token exchange error - package not found' },
    { package: 'b-json', status: 503, ok: false, message: 'npm returned an invalid JSON response' },
    { package: 'c-missing', status: 201, ok: false, message: 'npm response is missing an exchange token' },
    { package: 'd-network', status: null, ok: false, message: 'npm token exchange request failed or timed out' },
    { package: 'e-ok', status: 201, ok: true, message: 'OIDC token exchange succeeded' },
  ])
  expect(report.hints.join(' ')).toContain('HTTP 404 alone does not prove')
  expect(report.hints.join(' ')).toContain('48 hours')
  expect(fetcher).toHaveBeenCalledTimes(6)
  expect(JSON.stringify(report)).not.toContain(requestToken)
  expect(JSON.stringify(report)).not.toContain(idToken)
})

it('redacts nested messages and allowlisted identity fields, discards other claims and caps messages', async () => {
  const payload = { ...claims, environment: requestToken, custom_claim: 'private-claim' }
  const jwt = tokenFor(payload)
  const fetcher = mockFetch(() => json({ token: exchangeToken, body: { message: `${jwt} ${requestToken} ${exchangeToken}\n${'x'.repeat(1000)}` } }, 403), { value: jwt })
  const report = await auditReleaseOidc({ cwd: await workspace(), env, fetch: fetcher })
  const output = JSON.stringify(report)
  for (const secret of [jwt, requestToken, exchangeToken, 'private-claim']) {
    expect(output).not.toContain(secret)
  }
  expect(report.identity['environment']).toBe('[redacted]')
  expect(report.results[0]?.message).toHaveLength(500)
  expect(report.results[0]?.message).not.toContain('\n')
})

it('rejects non-npm publication targets before obtaining credentials', async () => {
  const cwd = await workspace()
  await writeFile(path.join(cwd, 'packages', 'repoctl', 'package.json'), JSON.stringify({ name: 'repoctl', version: '1.0.0', publishConfig: { registry: 'https://other.example' } }))
  const fetcher = mockFetch()
  await expect(auditReleaseOidc({ cwd, env, fetch: fetcher })).rejects.toThrow('official npm registry')
  expect(fetcher).not.toHaveBeenCalled()
})

it('keeps at most four package exchanges in flight and retains deterministic results', async () => {
  let active = 0
  let peak = 0
  const fetcher = mockFetch(async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 1))
    active -= 1
    return json({ token: exchangeToken })
  })
  const names = Array.from({ length: 9 }, (_, index) => `p${index}`)
  const report = await auditReleaseOidc({ cwd: await workspace(names), env, fetch: fetcher })
  expect(peak).toBe(4)
  expect(report.results.map(result => result.package)).toEqual(names)
})
