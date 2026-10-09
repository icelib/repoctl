import { readFile } from 'node:fs/promises'
import { releaseCi } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, expect, it } from 'vitest'
import { cleanupReleaseTempRoots } from '../release-fixtures'
import { recoveryRemote, recoveryRunner, source } from './recovery-fixtures'

afterEach(cleanupReleaseTempRoots)

async function stagedHarness() {
  const remote = recoveryRemote()
  const h = await recoveryRunner(remote)
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, settings) => {
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--git-dir') {
      return { status: 0, stdout: '.git' }
    }
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
      return { status: 0, stdout: source }
    }
    if (command === 'git' && args[0] === 'diff' && args.includes('HEAD')) {
      return { status: 0, stdout: '' }
    }
    return original(command, args, settings)
  })
  h.options.env = { ...h.options.env, GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '1' }
  return { ...h, remote }
}

it('splits upload, read-only confirmation and metadata while running quality only once', async () => {
  const h = await stagedHarness()
  for (const stage of ['plan', 'verify', 'prepare', 'upload'] as const) {
    await releaseCi({ ...h.options, stage })
  }
  expect(h.uploads()).toHaveLength(1)
  expect(h.remote.releases.size).toBe(0)
  expect(h.remote.state()).toMatchObject({ uploadComplete: true, npm: 'running' })
  await releaseCi({ ...h.options, stage: 'confirm' })
  expect(h.uploads()).toHaveLength(1)
  expect(h.remote.state()?.npm).toBe('complete')
  expect(h.remote.releases.size).toBe(0)
  await releaseCi({ ...h.options, stage: 'finalize' })
  await releaseCi({ ...h.options, stage: 'finalize' })
  expect(h.remote.state()?.complete).toBe(true)
  expect(h.calls.filter(call => call.command === 'pnpm' && call.args[0] === 'run').map(call => call.args[1])).toEqual(['quality', 'before', 'after'])
  const report = JSON.parse(await readFile(path.join(h.cwd, 'repoctl-ci-progress.json'), 'utf8'))
  expect(report.done).toEqual(['plan', 'verify', 'prepare', 'upload', 'confirm', 'finalize'])
  expect(report.stages).toHaveLength(6)
})

it('rejects skipped quality, changed configuration and another Actions attempt', async () => {
  const h = await stagedHarness()
  await expect(releaseCi({ ...h.options, stage: 'upload' })).rejects.toThrow('receipt missing')
  await releaseCi({ ...h.options, stage: 'plan' })
  await expect(releaseCi({ ...h.options, stage: 'prepare' })).rejects.toThrow('preceding stage')
  await releaseCi({ ...h.options, stage: 'verify' })
  await expect(releaseCi({ ...h.options, stage: 'prepare', config: { qualityScripts: [] } })).rejects.toThrow('Stale')
  await expect(releaseCi({ ...h.options, stage: 'prepare', env: { ...h.options.env, GITHUB_RUN_ATTEMPT: '2' } })).rejects.toThrow('Stale')
  expect(h.uploads()).toHaveLength(0)
})

it('preserves stage failure evidence and resumes a checkpoint after metadata interruption', async () => {
  const h = await stagedHarness()
  for (const stage of ['plan', 'verify', 'prepare', 'upload', 'confirm'] as const) {
    await releaseCi({ ...h.options, stage })
  }
  h.remote.github.ensureRelease.mockRejectedValueOnce(new Error('GitHub interrupted'))
  await expect(releaseCi({ ...h.options, stage: 'finalize' })).rejects.toThrow('GitHub interrupted')
  const report = JSON.parse(await readFile(path.join(h.cwd, 'repoctl-ci-progress.json'), 'utf8'))
  expect(report.stages.at(-1)).toMatchObject({ stage: 'finalize', status: 'failed' })
  await releaseCi({ ...h.options, stage: 'finalize' })
  expect(h.uploads()).toHaveLength(1)
  expect(h.remote.state()?.complete).toBe(true)
})

it('keeps default all hook ordering equivalent to the staged entrypoint', async () => {
  const h = await stagedHarness()
  await releaseCi({ ...h.options, stage: 'all' })
  expect(h.calls.filter(call => call.command === 'pnpm' && call.args[0] === 'run').map(call => call.args[1])).toEqual(['quality', 'before', 'after'])
  expect(h.remote.state()?.complete).toBe(true)
})

it('skips all later work for an ordinary push without a release trigger', async () => {
  const h = await stagedHarness()
  const result = await releaseCi({ ...h.options, mode: 'auto', stage: 'plan', env: { ...h.options.env, GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'main' } })
  expect(result).toMatchObject({ action: 'skip', publish: false })
  expect(h.uploads()).toHaveLength(0)
  expect(h.calls.some(call => call.args[1] === 'quality')).toBe(false)
})
