import { spawnSync } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { auditReleaseOidc, releaseCi } from '@icebreakers/monorepo'
import { afterEach, expect, it, vi } from 'vitest'
import { rootDir } from '@/constants'
import { cleanupReleaseTempRoots, writePendingIntent } from '../../release-fixtures'
import { env, idToken, json, mockFetch, requestToken, workspace } from './fixtures'

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await cleanupReleaseTempRoots()
})

it.each(['explicit', 'environment'])('routes %s audit before config, quality scripts, hooks, preparation and publication', async (mode) => {
  const cwd = await workspace()
  await writePendingIntent(cwd)
  await writeFile(path.join(cwd, 'repoctl.config.mjs'), 'throw new Error("release config must not load")')
  const before = await readFile(path.join(cwd, '.changeset', 'pending-change.md'), 'utf8')
  const spawn = vi.fn()
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  vi.stubGlobal('fetch', mockFetch())
  const result = await releaseCi({ cwd, spawn, env: { ...env, REPO_RELEASE_MODE: 'oidc-audit' }, ...(mode === 'explicit' ? { mode: 'oidc-audit' as const } : {}) })
  expect(result).toMatchObject({ ok: true, results: [{ package: 'repoctl' }] })
  expect(spawn).not.toHaveBeenCalled()
  expect(stdout).toHaveBeenCalledTimes(1)
  expect(await readFile(path.join(cwd, '.changeset', 'pending-change.md'), 'utf8')).toBe(before)
  expect(await readdir(cwd)).not.toContain('repoctl-release-progress.json')
  expect(await readdir(cwd)).not.toContain('repoctl-publish-progress.json')
})

it('prints the complete safe report then fails CI on an exchange failure', async () => {
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  vi.stubGlobal('fetch', mockFetch(name => name === 'bad' ? json({ message: 'package not found' }, 404) : json({ token: 'never-save' })))
  await expect(releaseCi({ cwd: await workspace(['bad', 'good']), env, mode: 'oidc-audit' })).rejects.toThrow('1/2 packages')
  expect(JSON.parse(String(stdout.mock.calls[0]![0]))).toMatchObject({ ok: false, results: [{ package: 'bad', ok: false }, { package: 'good', ok: true }] })
})

it.each([
  { sourceSha: 'a'.repeat(40) },
  { dryRun: true },
  { packageName: 'repoctl' },
  { packageVersion: '1.0.0' },
  { env: { ...env, REPO_RELEASE_RECOVERY_SOURCE_SHA: 'a'.repeat(40) } },
  { env: { ...env, REPO_RELEASE_DRY_RUN: 'true' } },
  { env: { ...env, REPO_RELEASE_PACKAGE: 'repoctl' } },
])('rejects recovery flags before network or subprocesses: %j', async (options) => {
  const fetcher = mockFetch()
  const spawn = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  await expect(releaseCi({ cwd: await workspace(), mode: 'oidc-audit', env, spawn, ...options })).rejects.toThrow('cannot be combined')
  expect(fetcher).not.toHaveBeenCalled()
  expect(spawn).not.toHaveBeenCalled()
})

it('hides credential-bearing GitHub request exceptions and response bodies', async () => {
  const cwd = await workspace()
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(`${requestToken} ${idToken}`))
  await expect(auditReleaseOidc({ cwd, env, fetch: fetcher })).rejects.toThrow('no credentials were saved')
  fetcher.mockResolvedValue(json({ message: `${requestToken} ${idToken}` }, 403))
  await expect(auditReleaseOidc({ cwd, env, fetch: fetcher })).rejects.toThrow('HTTP 403')
})

it.each([
  { args: ['--mode', 'oidc-audit'], failed: true },
  { args: [], failed: true },
  { args: ['--mode', 'oidc-audit'], failed: false },
  { args: [], failed: false },
])('exposes built CLI audit without evaluating release config: %j', async ({ args, failed }) => {
  const cwd = await workspace(failed ? ['bad', 'good'] : ['good'])
  await writeFile(path.join(cwd, 'repoctl.config.mjs'), 'throw new Error("must not evaluate release config")')
  const preload = path.join(cwd, 'fetch.mjs')
  await writeFile(preload, `globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const body = url.hostname === 'oidc.actions.githubusercontent.com' ? { value: ${JSON.stringify(idToken)} }
      : url.pathname.endsWith('/bad') ? { message: 'OIDC token exchange error - package not found' } : { token: 'fake-exchange-secret' };
    return new Response(JSON.stringify(body), { status: url.pathname.endsWith('/bad') ? 404 : 201 });
  }`)
  const result = spawnSync(process.execPath, ['--import', preload, path.join(rootDir, 'packages', 'repoctl', 'bin', 'repo.js'), 'release', 'ci', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, ...env, REPO_RELEASE_MODE: ' oidc-audit ', REPOCTL_LANG: 'en' },
  })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(failed ? 1 : 0)
  expect(result.stdout, result.stderr).not.toBe('')
  const report = JSON.parse(result.stdout)
  expect(report).toMatchObject({ ok: !failed, results: failed ? [{ package: 'bad', status: 404 }, { package: 'good', status: 201 }] : [{ package: 'good', status: 201 }] })
  if (failed) {
    expect(result.stderr).toContain('1/2 packages')
  }
  for (const secret of [requestToken, idToken, 'fake-exchange-secret']) {
    expect(result.stdout + result.stderr).not.toContain(secret)
  }
})

it('keeps executable configuration preflight for actual publishing despite an audit environment default', async () => {
  const cwd = await workspace()
  await writeFile(path.join(cwd, 'repoctl.config.mjs'), 'throw new Error("actual release config was validated")')
  const result = spawnSync(process.execPath, [path.join(rootDir, 'packages', 'repoctl', 'bin', 'repo.js'), 'release', 'ci', '--mode', 'publish'], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, REPO_RELEASE_MODE: 'oidc-audit' },
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('config.load-failed')
})
