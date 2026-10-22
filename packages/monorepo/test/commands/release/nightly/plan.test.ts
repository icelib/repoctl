import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createNightlyPlan, releaseNightly } from '@icebreakers/monorepo'
import { describe, expect, it, vi } from 'vitest'
import { snapshot } from '../snapshot/fixture'
import { fixture, json, npmFetch, schedule } from './fixture'

describe('nightly source and event planning', () => {
  it('previews all public npm packages without building, consuming intents or requiring publication authorization', async () => {
    const h = await fixture()
    const before = await snapshot(h.cwd)
    const report = await releaseNightly({ ...h.options, publish: true, dryRun: true, env: { ...h.env, REPOCTL_SNAPSHOT_PUBLISH: '0' } })
    expect(report.status, report.error).toBe('planned')
    expect(report.packages.map(pkg => pkg.name)).toEqual(['snapshot-a', 'snapshot-b'])
    expect(report.packages.every(pkg => pkg.locator === `${pkg.name}@snapshot-nightly`)).toBe(true)
    expect(report.snapshot?.identity).toMatchObject({ kind: 'nightly', buildId: '123-1' })
    expect(report.snapshot?.packages.every(pkg => !pkg.tarball)).toBe(true)
    expect(JSON.parse(await readFile(path.join(report.outputDirectory!, 'nightly-report.json'), 'utf8'))).toEqual(report)
    expect(await readFile(h.env.GITHUB_STEP_SUMMARY, 'utf8')).toContain('Status: planned')
    expect(await snapshot(h.cwd)).toEqual(before)
  })

  it('skips a complete scheduled channel but manual retries get a new build identity', async () => {
    const h = await fixture('schedule')
    const first = await createNightlyPlan(h.options)
    const registryFetch = npmFetch(first)
    const automatic = await releaseNightly({ ...h.options, registryFetch })
    expect(automatic.status, automatic.error).toBe('skipped')
    expect(automatic.commands).toEqual([])
    const manual = await createNightlyPlan({ ...h.options, registryFetch, env: { ...h.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '2' } })
    expect(manual.status, manual.error).toBe('planned')
    expect(manual.snapshot?.identityKey).not.toBe(first.snapshot?.identityKey)
    expect(manual.packages[0]?.version).not.toBe(first.packages[0]?.version)
  })

  it('rebuilds partially published channels and channels containing different build identities', async () => {
    const h = await fixture('schedule')
    const first = await createNightlyPlan(h.options)
    const partial = await createNightlyPlan({ ...h.options, registryFetch: npmFetch(first, (name, metadata) => name === 'snapshot-a' ? metadata : null) })
    expect(partial.status, partial.error).toBe('planned')
    const mixed = await createNightlyPlan({ ...h.options, registryFetch: npmFetch(first, (name, metadata) => name === 'snapshot-a' ? metadata : { ...metadata, repoctlSnapshot: { ...metadata.repoctlSnapshot, buildId: 'other-build' } }) })
    expect(mixed.status, mixed.error).toBe('planned')
  })

  it.each([401, 429, 503])('fails closed when the registry returns HTTP %i', async (status) => {
    const h = await fixture('schedule')
    const report = await createNightlyPlan({ ...h.options, registryFetch: vi.fn(async () => json({}, status)) })
    expect(report.status).toBe('failed')
    expect(report.error).toContain(`HTTP ${status}`)
    expect(report.commands).toEqual([])
    expect(JSON.parse(await readFile(path.join(report.outputDirectory!, 'nightly-report.json'), 'utf8')).status).toBe('failed')
  })

  it('rejects non-default-branch, incorrect dispatch mode and mismatched workflow markers', async () => {
    const h = await fixture()
    const branch = await createNightlyPlan({ ...h.options, env: { ...h.env, GITHUB_REF: 'refs/heads/feature' } })
    expect(branch.status).toBe('failed')
    expect(branch.error).toContain('default branch')
    const marker = await createNightlyPlan({ ...h.options, env: { ...h.env, REPOCTL_NIGHTLY_PROVIDER: 'pkg-pr-new' } })
    expect(marker.error).toContain('synchronize the workflow')
    await writeFile(h.env['GITHUB_EVENT_PATH']!, JSON.stringify({ ...h.event, inputs: { mode: 'auto' } }))
    expect((await createNightlyPlan(h.options)).error).toContain('nightly workflow dispatch')
    expect(h.registryFetch).not.toHaveBeenCalled()
  })

  it('only admits scheduled events matching an explicitly configured cron', async () => {
    const h = await fixture('schedule')
    for (const nightly of [{}, { schedule: '0 1 * * *' }]) {
      const report = await releaseNightly({ ...h.options, config: { nightly } })
      expect(report.status, report.error).toBe('skipped')
      expect(report.reason).toContain('not enabled')
    }
    const enabled = await createNightlyPlan({ ...h.options, env: { ...h.env, REPOCTL_NIGHTLY_PROVIDER: 'npm', REPOCTL_NIGHTLY_SCHEDULE: schedule } })
    expect(enabled.status, enabled.error).toBe('planned')
  })

  it('skips private-only workspaces and rejects dirty or in-checkout outputs', async () => {
    const h = await fixture()
    const inside = await createNightlyPlan({ ...h.options, outputDirectory: path.join(h.cwd, 'nightly') })
    expect(inside.status).toBe('failed')
    expect(inside.error).toContain('outside the source')
    await h.write('uncommitted', 'work')
    expect((await createNightlyPlan(h.options)).error).toContain('clean committed source')
    for (const name of ['a', 'b']) {
      const filename = `packages/${name}/package.json`
      const manifest = JSON.parse(await readFile(path.join(h.cwd, filename), 'utf8'))
      await h.write(filename, JSON.stringify({ ...manifest, private: true }))
    }
    h.run('git', ['add', '.'])
    h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'private workspace'])
    const report = await releaseNightly({ ...h.options, env: { ...h.env, GITHUB_SHA: h.run('git', ['rev-parse', 'HEAD']) } })
    expect(report.status, report.error).toBe('skipped')
    expect(report.reason).toContain('No public workspace packages')
    expect(h.registryFetch).not.toHaveBeenCalled()
  })

  it('requires publication authorization before quality scripts or preparation', async () => {
    const h = await fixture()
    const report = await releaseNightly({ ...h.options, publish: true, env: { ...h.env, REPOCTL_SNAPSHOT_PUBLISH: '0' } })
    expect(report.status).toBe('failed')
    expect(report.error).toContain('REPOCTL_SNAPSHOT_PUBLISH')
    expect(report.commands).toEqual([])
    expect(report.snapshot?.packages.every(pkg => !pkg.tarball)).toBe(true)
  })
})
