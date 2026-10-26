import { auditReleaseOidc } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { claims, env, mockFetch, tokenFor } from './fixtures'

it('audits an artifact package list without a workspace or candidate configuration', async () => {
  const fetcher = mockFetch(undefined, { value: tokenFor({ ...claims, event_name: 'workflow_run' }) })
  const result = await auditReleaseOidc({ packages: [{ name: 'repoctl', version: '1.0.0-snapshot.pr.1' }], env, fetch: fetcher })
  expect(result.ok).toBe(true)
  expect(result.identity['event_name']).toBe('workflow_run')
  expect(result.results.map(item => item.package)).toEqual(['repoctl'])
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it.each([
  [],
  [{ name: 'repoctl', version: 'invalid' }],
  [{ name: '../escape', version: '1.0.0' }],
  [{ name: 'repoctl', version: '1.0.0', registry: 'https://example.com' }],
  [{ name: 'repoctl', version: '1.0.0' }, { name: 'repoctl', version: '2.0.0' }],
].map(packages => ({ packages })))('rejects invalid artifact candidates before requesting OIDC: %j', async ({ packages }) => {
  const fetcher = mockFetch()
  await expect(auditReleaseOidc({ packages, env, fetch: fetcher })).rejects.toThrow('no credentials were requested')
  expect(fetcher).not.toHaveBeenCalled()
})

it.each([
  { packages: [{ name: 'repoctl', version: '1.0.0', registry: 123 }] },
  { packages: null },
  {},
  { cwd: '.', packageNames: 'repoctl' },
])('rejects malformed JavaScript options before requesting credentials: %j', async (options) => {
  const fetcher = mockFetch()
  await expect(auditReleaseOidc({ ...options, env, fetch: fetcher } as never)).rejects.toThrow('no credentials were requested')
  expect(fetcher).not.toHaveBeenCalled()
})
