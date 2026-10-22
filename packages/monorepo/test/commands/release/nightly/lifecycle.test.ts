import type { NightlyOptions } from '@icebreakers/monorepo'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createNightlyPlan, releaseNightly } from '@icebreakers/monorepo'
import { expect, it, vi } from 'vitest'
import { runQualityScripts, runUncachedQualityScripts } from '../../../../src/commands/release/hooks'
import { authorizeVerification } from '../../../../src/commands/release/stages/verification'
import { idToken, env as oidcEnv } from '../oidc/fixtures'
import { fixture, json } from './fixture'

it('prepares real tarballs by default after quality and verify hooks, without stable lifecycle hooks or publication', async () => {
  const h = await fixture()
  const hooks: string[] = []
  const original = h.options.spawn!
  const spawn: NonNullable<NightlyOptions['spawn']> = ((command, args, settings) => {
    if (command === 'pnpm' && args?.[0] === 'run' && args[1] === 'nightly-verify') {
      hooks.push(args[1])
      expect(settings?.env?.['REPOCTL_SNAPSHOT_PUBLISH']).toBeUndefined()
      return { pid: 1, output: [null, 'verify output', ''], stdout: 'verify output', stderr: '', status: 0, signal: null }
    }
    return original(command, args, settings)
  }) as NonNullable<NightlyOptions['spawn']>
  const before = h.run('git', ['rev-parse', 'HEAD'])
  const report = await releaseNightly({ ...h.options, spawn, config: { ...h.options.config, hooks: { verify: ['nightly-verify'], beforeVersion: ['must-not-run'], afterVersion: ['must-not-run'], beforePublish: ['must-not-run'], afterPublish: [{ script: 'must-not-run' }] } } })
  expect(report.status, report.error).toBe('prepared')
  expect(hooks).toEqual(['nightly-verify'])
  expect(report.snapshot?.checks?.every(check => check.status === 'passed')).toBe(true)
  expect(report.packages.every(pkg => pkg.integrity?.startsWith('sha512-') && !pkg.published)).toBe(true)
  for (const pkg of report.snapshot!.packages) {
    expect((await readFile(pkg.tarball!)).byteLength).toBeGreaterThan(0)
  }
  expect(report.commands.some(command => command.stdout === 'verify output')).toBe(true)
  expect(h.uploads).toEqual([])
  expect(h.run('git', ['rev-parse', 'HEAD'])).toBe(before)
  expect(h.run('git', ['status', '--porcelain'])).toBe('')
  expect(h.run('git', ['tag', '--list'])).toBe('')
  expect(await readFile(path.join(h.cwd, '.changeset/snapshot.md'), 'utf8')).toContain('Improve the fixture.')
}, 120_000)

it('does not reuse stable verification capabilities for nightly quality and verify scripts', async () => {
  const h = await fixture()
  const options = authorizeVerification({ ...h.options, config: { qualityScripts: ['build', 'test'], hooks: { verify: ['verify-nightly'], beforeVersion: ['forbidden'] } } })
  const execute = vi.fn()
  await expect(runQualityScripts(h.options)).rejects.toThrow('workspace:*')
  await runQualityScripts(options)
  await runUncachedQualityScripts(options, execute)
  expect(execute.mock.calls.map(call => call[1])).toEqual([['run', 'build'], ['run', 'test'], ['run', 'verify-nightly']])
})

it('keeps scheduled pkg.pr.new builds eligible for local byte comparison even when every URL already exists', async () => {
  const h = await fixture('schedule')
  const options = { ...h.options, config: { ...h.options.config, nightly: { ...h.options.config!.nightly, provider: 'pkg-pr-new' as const } } }
  const prepared = await releaseNightly(options)
  expect(prepared.status, prepared.error).toBe('prepared')
  const registryFetch = vi.fn<typeof fetch>(async (input) => {
    const pkg = prepared.packages.find(item => item.locator === String(input))!
    const artifact = prepared.snapshot!.packages.find(item => item.name === pkg.name)!
    return new Response(Uint8Array.from(await readFile(artifact.tarball!)))
  })
  const plan = await createNightlyPlan({ ...options, registryFetch })
  expect(plan.status, plan.error).toBe('planned')
  expect(Object.keys(plan.existing ?? {})).toHaveLength(prepared.packages.length)
}, 120_000)

it('stops before quality or preparation when any planned npm Trusted Publisher fails', async () => {
  const h = await fixture()
  const registryFetch = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input))
    if (url.hostname === 'oidc.actions.githubusercontent.com') {
      return json({ value: idToken })
    }
    if (url.pathname.includes('/oidc/token/exchange/package/')) {
      return json({ message: 'publisher does not match this workflow' }, 403)
    }
    return json({}, 404)
  })
  const report = await releaseNightly({ ...h.options, publish: true, registryFetch, env: { ...h.env, ...oidcEnv } })
  expect(report.status).toBe('failed')
  expect(report.error).toContain('Trusted Publisher audit failed')
  expect(report.oidc?.results.map(item => item.package)).toEqual(['snapshot-a', 'snapshot-b'])
  expect(report.commands).toEqual([])
  expect(report.snapshot?.packages.every(pkg => !pkg.tarball)).toBe(true)
  expect(h.uploads).toEqual([])
})
