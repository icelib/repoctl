import { releaseCi } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanupReleaseTempRoots } from '../../release-fixtures'
import { a, b } from '../publish-fixtures'
import { recoveryRemote, recoveryRunner } from '../recovery-fixtures'

afterEach(cleanupReleaseTempRoots)

it.each([0, 1])('preserves npm success and does not repeat a finished mirror hook (mirror exit: %s)', async (status) => {
  const remote = recoveryRemote()
  const first = await recoveryRunner(remote)
  const hooks = [
    { script: 'after', idempotent: true },
    { script: 'release:sync-npmmirror', continueOnError: true, idempotent: true },
  ]
  first.options.config!.hooks!.afterPublish = hooks
  const original = first.spawn.getMockImplementation()!
  first.spawn.mockImplementation((command, args, options) => {
    const result = original(command, args, options)
    if (args[1] === 'release:sync-npmmirror') {
      expect(options?.env).toMatchObject({ REPO_RELEASE_PUBLISHED_PACKAGES: JSON.stringify([a, b]) })
      return { status, stdout: '' }
    }
    return result
  })
  await expect(releaseCi(first.options)).resolves.toEqual([a, b])
  expect(remote.state()).toMatchObject({
    complete: true,
    hooks: { 'after': 'complete', 'release:sync-npmmirror': status === 0 ? 'complete' : 'ignored' },
  })
  const resumed = await recoveryRunner(remote, [])
  resumed.options.config!.hooks!.afterPublish = hooks
  await releaseCi(resumed.options)
  expect(resumed.uploads()).toHaveLength(0)
  expect(resumed.calls.some(call => call.args[1] === 'release:sync-npmmirror')).toBe(false)
})
