import { releaseCi } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanupReleaseTempRoots } from '../release-fixtures'
import { a, b } from './publish-fixtures'
import { keyOf, later, recoveryRemote, recoveryRunner, source } from './recovery-fixtures'

afterEach(cleanupReleaseTempRoots)

it('recovers two published versions on a fresh runner, preserving the original commit', async () => {
  const remote = recoveryRemote()
  ;[a, b].forEach(pkg => remote.versions.add(keyOf(pkg)))
  const h = await recoveryRunner(remote, [])
  h.options.env!['GITHUB_SHA'] = later
  await expect(releaseCi(h.options)).resolves.toEqual([a, b])
  expect(h.uploads()).toHaveLength(0)
  expect(remote.tags).toEqual(new Map([[keyOf(a), source], [keyOf(b), source]]))
  expect(remote.releases.size).toBe(2)
  expect(remote.state()).toMatchObject({ complete: true, hooks: { after: 'complete' } })
})

it('resumes after a release write succeeds but its response is lost, without repeating uploads or completed hooks', async () => {
  const remote = recoveryRemote()
  const ensure = remote.github.ensureRelease.getMockImplementation()!
  remote.github.ensureRelease.mockImplementationOnce(async (options) => {
    await ensure(options)
    throw new Error('response lost')
  })
  const first = await recoveryRunner(remote)
  await expect(releaseCi(first.options)).rejects.toThrow('response lost')
  expect(first.uploads()).toHaveLength(1)
  expect(remote.tags.has(keyOf(a))).toBe(true)
  const next = await recoveryRunner(remote, [])
  next.options.env!['GITHUB_SHA'] = later
  await expect(releaseCi(next.options)).resolves.toEqual([a, b])
  expect(next.uploads()).toHaveLength(0)
  expect(remote.github.ensureRelease).toHaveBeenCalledTimes(2)
  expect(next.calls.filter(call => call.args[1] === 'after')).toHaveLength(1)
  const again = await recoveryRunner(remote, [])
  await releaseCi(again.options)
  expect(again.uploads()).toHaveLength(0)
  expect(again.calls.filter(call => call.args[1] === 'after')).toHaveLength(0)
  expect(remote.github.ensureRelease).toHaveBeenCalledTimes(2)
})

it('does not repeat an unknown non-idempotent hook, and supports verified manual acknowledgement', async () => {
  const remote = recoveryRemote()
  const first = await recoveryRunner(remote)
  first.options.config!.hooks!.afterPublish = [{ script: 'after' }]
  const original = first.spawn.getMockImplementation()!
  first.spawn.mockImplementation((command, args, options) => args[1] === 'after'
    ? { status: 1, stdout: '' }
    : original(command, args, options))
  await expect(releaseCi(first.options)).rejects.toThrow('command failed')
  expect(remote.state()).toMatchObject({ complete: false, hooks: { after: 'running' } })
  const next = await recoveryRunner(remote, [])
  next.options.config!.hooks!.afterPublish = [{ script: 'after' }]
  await expect(releaseCi(next.options)).rejects.toThrow('unknown outcome')
  expect(next.calls.filter(call => call.args[1] === 'after')).toHaveLength(0)
  next.options.env!['REPO_RELEASE_ACKNOWLEDGE_HOOKS'] = 'after'
  await releaseCi(next.options)
  expect(remote.state()?.complete).toBe(true)
})

it('preserves optional-hook failures as ignored instead of rerunning them', async () => {
  const remote = recoveryRemote()
  const h = await recoveryRunner(remote)
  h.options.config!.hooks!.afterPublish = [{ script: 'after', continueOnError: true }]
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, options) => args[1] === 'after'
    ? { status: 1, stdout: '' }
    : original(command, args, options))
  await releaseCi(h.options)
  expect(remote.state()).toMatchObject({ complete: true, hooks: { after: 'ignored' } })
})

it.each(['quality', 'before'])('does not publish after %s fails', async (script) => {
  const remote = recoveryRemote()
  const h = await recoveryRunner(remote)
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, options) => args[1] === script ? { status: 1, stdout: '' } : original(command, args, options))
  await expect(releaseCi(h.options)).rejects.toThrow('command failed')
  expect(h.uploads()).toHaveLength(0)
  expect(remote.releases.size).toBe(0)
})

it.each(['E401', 'E403', 'ETIMEDOUT', 'SELF_SIGNED_CERT_IN_CHAIN', 'E429', 'E503'])('treats registry %s as failure, never as missing', async (failure) => {
  const remote = recoveryRemote()
  const h = await recoveryRunner(remote)
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, options) => command === 'npm' ? { status: 1, stdout: '', stderr: failure } : original(command, args, options))
  await expect(releaseCi(h.options)).rejects.toThrow(/authentication failed|state is unknown/)
  expect(h.uploads()).toHaveLength(0)
  expect(remote.github.writeReleaseState).not.toHaveBeenCalled()
  expect(h.sleep).toHaveBeenCalledTimes(['E401', 'E403'].includes(failure) ? 0 : 2)
})

it('does not write checkpoints, tags, releases, or execute hooks in dry-run', async () => {
  const remote = recoveryRemote()
  const h = await recoveryRunner(remote)
  await releaseCi({ ...h.options, dryRun: true })
  expect(remote.github.writeReleaseState).not.toHaveBeenCalled()
  expect(remote.github.ensureTag).not.toHaveBeenCalled()
  expect(remote.github.ensureRelease).not.toHaveBeenCalled()
  expect(h.calls.some(call => call.command === 'pnpm')).toBe(false)
})

it('rejects checkpoint ownership, tag conflicts, and source mismatches', async () => {
  const remote = recoveryRemote()
  const h = await recoveryRunner(remote)
  remote.tags.set(keyOf(a), later)
  await expect(releaseCi(h.options)).rejects.toThrow('Tag target conflict')
  expect(remote.releases.size).toBe(0)
  remote.state()!.repository = 'other/repo'
  const next = await recoveryRunner(remote, [])
  await expect(releaseCi(next.options)).rejects.toThrow('checkpoint identity')
  expect(next.uploads()).toHaveLength(0)
})

it('does not invent the source SHA of an already published version', async () => {
  const remote = recoveryRemote()
  const h = await recoveryRunner(remote, [])
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, options) => command === 'npm'
    ? { status: 0, stdout: JSON.stringify({ 'version': '1.0.0', 'dist-tags': { latest: '1.0.0' } }) }
    : original(command, args, options))
  await expect(releaseCi(h.options)).rejects.toThrow('Cannot establish original commit')
  expect(remote.github.writeReleaseState).not.toHaveBeenCalled()
})

it('refuses to claim completion when the npm dist-tag is wrong', async () => {
  const remote = recoveryRemote()
  const h = await recoveryRunner(remote)
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, options) => {
    const result = original(command, args, options)
    if (command === 'npm' && args.includes('--json') && result.status === 0) {
      return { status: 0, stdout: JSON.stringify({ 'version': '1.0.0', 'gitHead': source, 'dist-tags': { latest: '0.9.0' } }) }
    }
    return result
  })
  await expect(releaseCi(h.options)).rejects.toThrow('dist-tag latest is not confirmed')
  expect(remote.releases.size).toBe(0)
  expect(remote.state()?.complete).toBe(false)
})

it('preserves genuine no-op behavior for versions with existing releases and no checkpoint', async () => {
  const remote = recoveryRemote()
  for (const pkg of [a, b]) {
    remote.versions.add(keyOf(pkg))
    await remote.github.ensureRelease({ tag: keyOf(pkg), target: source })
  }
  const h = await recoveryRunner(remote, [])
  await expect(releaseCi(h.options)).resolves.toEqual([])
  expect(remote.github.writeReleaseState).not.toHaveBeenCalled()
  expect(h.uploads()).toHaveLength(0)
  expect(h.calls.filter(call => call.args[1] === 'after')).toHaveLength(0)
})
