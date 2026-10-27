import type { SnapshotPreparationContext } from '@icebreakers/monorepo'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createNightlyPlan, releaseNightly } from '@icebreakers/monorepo'
import { expect, it, vi } from 'vitest'
import { fixture, npmFetch } from '../../nightly/fixture'

it('forwards the programmatic callback through nightly preparation without changing quality configuration', async () => {
  const h = await fixture()
  const prepareSource = vi.fn(async (context: SnapshotPreparationContext) => {
    expect(context.identity.commit).toBe(h.env['GITHUB_SHA'])
    expect(context.packages.every(pkg => pkg.version.includes('-snapshot.nightly.'))).toBe(true)
    return { files: [] }
  })
  const report = await releaseNightly({ ...h.options, prepareSource })
  expect(report.status, report.error).toBe('prepared')
  expect(prepareSource).toHaveBeenCalledOnce()
  expect(report.snapshot?.preparation?.tree).toBe(h.run('git', ['rev-parse', 'HEAD^{tree}']))
  expect(report.commands.some(command => command.args.join(' ') === 'run build')).toBe(true)
}, 120_000)

it('does not execute source preparation for nightly inspection or a complete scheduled batch', async () => {
  const h = await fixture('schedule')
  const prepareSource = vi.fn(async () => ({ files: [] }))
  const options = { ...h.options, prepareSource }
  const plan = await createNightlyPlan(options)
  expect(plan.status, plan.error).toBe('planned')
  const inspected = await releaseNightly({ ...options, dryRun: true })
  expect(inspected.status, inspected.error).toBe('planned')
  const skipped = await releaseNightly({ ...options, registryFetch: npmFetch(plan) })
  expect(skipped.status, skipped.error).toBe('skipped')
  expect(prepareSource).not.toHaveBeenCalled()
  expect(h.uploads).toEqual([])
}, 120_000)

it('keeps the callback disabled when nightly source or quality verification fails', async () => {
  const h = await fixture()
  const prepareSource = vi.fn(async () => ({ files: [] }))
  await writeFile(path.join(h.cwd, 'UNTRACKED'), 'dirty')
  const report = await releaseNightly({ ...h.options, prepareSource })
  expect(report.status).toBe('failed')
  expect(report.error).toContain('clean committed source')
  expect(prepareSource).not.toHaveBeenCalled()
})
