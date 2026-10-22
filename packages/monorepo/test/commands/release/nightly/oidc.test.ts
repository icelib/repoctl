import { auditReleaseOidc } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanupReleaseTempRoots } from '../../release-fixtures'
import { env, mockFetch, workspace } from '../oidc/fixtures'

afterEach(cleanupReleaseTempRoots)

it('audits the exact planned public package set including a publishable root', async () => {
  const cwd = await workspace(['child'])
  const fetcher = mockFetch()
  const report = await auditReleaseOidc({ cwd, env, fetch: fetcher, packageNames: ['public-root', 'child'] })
  expect(report.ok).toBe(true)
  expect(report.results.map(item => item.package)).toEqual(['child', 'public-root'])
  expect(fetcher).toHaveBeenCalledTimes(3)
})

it.each([{ packageNames: ['child', 'missing'] }, { packageNames: ['child', 'child'] }])('rejects invalid or duplicated candidate plans before requesting credentials: %j', async ({ packageNames }) => {
  const cwd = await workspace(['child'])
  const fetcher = mockFetch()
  await expect(auditReleaseOidc({ cwd, env, fetch: fetcher, packageNames })).rejects.toThrow('exactly match')
  expect(fetcher).not.toHaveBeenCalled()
})
