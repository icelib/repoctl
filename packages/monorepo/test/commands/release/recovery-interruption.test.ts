import { publishStable, releaseCi } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanupReleaseTempRoots } from '../release-fixtures'
import { a, b, publishHarness } from './publish-fixtures'
import { keyOf, recoveryRemote, recoveryRunner } from './recovery-fixtures'

afterEach(cleanupReleaseTempRoots)

it('persists partial acceptance and uploads only the missing version on a new runner', async () => {
  const remote = recoveryRemote()
  const first = await recoveryRunner(remote, [a])
  await expect(releaseCi(first.options)).rejects.toThrow('visibility confirmation timed out')
  expect(remote.state()).toMatchObject({ npm: 'failed', accepted: [a] })
  const next = await recoveryRunner(remote, [b])
  await releaseCi(next.options)
  const args = next.uploads()[0]!.args
  expect(args.slice(args.indexOf('--filter'))).toEqual(['--filter', b.name])
  expect(remote.state()?.complete).toBe(true)
  expect(remote.releases.size).toBe(2)
})

it('recovers a lost runner after upload before any acceptance response was persisted', async () => {
  const remote = recoveryRemote()
  remote.github.ensureRelease.mockRejectedValueOnce(new Error('interrupted'))
  const first = await recoveryRunner(remote)
  await expect(releaseCi(first.options)).rejects.toThrow('interrupted')
  remote.state()!.npm = 'running'
  remote.state()!.accepted = []
  const next = await recoveryRunner(remote, [])
  await releaseCi(next.options)
  expect(next.uploads()).toHaveLength(0)
  expect(remote.state()?.complete).toBe(true)
})

it('does not reupload when a lost runner may have uploaded versions not visible yet', async () => {
  const remote = recoveryRemote()
  remote.github.ensureRelease.mockRejectedValueOnce(new Error('interrupted'))
  const first = await recoveryRunner(remote)
  await expect(releaseCi(first.options)).rejects.toThrow('interrupted')
  remote.state()!.npm = 'running'
  remote.state()!.accepted = []
  remote.versions.delete(keyOf(b))
  const next = await recoveryRunner(remote, [])
  await expect(releaseCi(next.options)).rejects.toThrow('visibility confirmation timed out')
  expect(next.uploads()).toHaveLength(0)
  expect(remote.state()?.complete).toBe(false)
})

it('checkpoints hooks individually and retries only an interrupted idempotent hook', async () => {
  const remote = recoveryRemote()
  const first = await recoveryRunner(remote)
  const hooks = [{ script: 'first' }, { script: 'second', idempotent: true }]
  first.options.config!.hooks!.afterPublish = hooks
  const original = first.spawn.getMockImplementation()!
  first.spawn.mockImplementation((command, args, options) => args[1] === 'second' ? { status: 1, stdout: '' } : original(command, args, options))
  await expect(releaseCi(first.options)).rejects.toThrow('command failed')
  expect(remote.state()?.hooks).toEqual({ first: 'complete', second: 'running' })
  const next = await recoveryRunner(remote, [])
  next.options.config!.hooks!.afterPublish = hooks
  await releaseCi(next.options)
  expect(next.calls.filter(call => call.command === 'pnpm' && call.args[0] === 'run').map(call => call.args[1])).toEqual(['quality', 'second'])
})

it('rejects a competing writer before it can upload', async () => {
  const remote = recoveryRemote()
  const first = await recoveryRunner(remote)
  const second = await recoveryRunner(remote)
  const results = await Promise.allSettled([releaseCi(first.options), releaseCi(second.options)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  expect(first.uploads().length + second.uploads().length).toBe(1)
  expect(remote.state()?.complete).toBe(true)
})

it('retains the full original batch when legacy recovery finds one Release already created', async () => {
  const remote = recoveryRemote()
  for (const pkg of [a, b]) {
    remote.versions.add(keyOf(pkg))
  }
  await remote.github.ensureRelease({ tag: keyOf(a), target: '1'.repeat(40) })
  const h = await recoveryRunner(remote, [])
  const result = await releaseCi(h.options)
  expect(result).toEqual(expect.arrayContaining([a, b]))
  expect(result).toHaveLength(2)
  expect(h.uploads()).toHaveLength(0)
  const hook = h.calls.find(call => call.args[1] === 'after')
  expect(JSON.parse(hook!.options!.env!['REPO_RELEASE_PUBLISHED_PACKAGES']!)).toEqual(expect.arrayContaining([a, b]))
})

it('never retries an unacknowledged upload when the recovery lookup is unknown', async () => {
  const h = await publishHarness([{ status: 1, summary: [a], stderr: 'HTTP 503' }], () => '')
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, options) => command === 'npm'
    ? { status: 1, stdout: '', stderr: 'ECONNRESET' }
    : original(command, args, options))
  await expect(publishStable(h.options)).rejects.toThrow('registry state is unknown')
  expect(h.uploads()).toHaveLength(1)
  expect(await h.report()).toMatchObject({ status: 'failed', acceptedPackages: [a] })
})
