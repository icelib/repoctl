import { reconcileRelease } from '@icebreakers/monorepo'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanupReleaseTempRoots } from '../release-fixtures'
import { a, b } from './publish-fixtures'
import { keyOf, later, recoveryRemote, recoveryRunner, source } from './recovery-fixtures'

afterEach(cleanupReleaseTempRoots)

it('keeps explicit reconciliation read-only when registry status is unknown', async () => {
  const remote = recoveryRemote()
  const h = await recoveryRunner(remote)
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, options) => command === 'npm' ? { status: 1, stdout: '', stderr: 'E401' } : original(command, args, options))
  await expect(reconcileRelease(h.options)).rejects.toThrow('authentication failed')
  expect(remote.github.ensureRelease).not.toHaveBeenCalled()
})

it('previews original commits and rejects conflicting tags without writes', async () => {
  const remote = recoveryRemote()
  for (const pkg of [a, b]) {
    remote.versions.add(keyOf(pkg))
  }
  const h = await recoveryRunner(remote)
  const github = { ...remote.github, readTagTarget: vi.fn(async () => undefined as string | undefined) }
  await expect(reconcileRelease({ ...h.options, github, dryRun: true })).resolves.toMatchObject({ pending: [keyOf(a), keyOf(b)], repaired: [] })
  expect(remote.github.ensureRelease).not.toHaveBeenCalled()
  github.readTagTarget.mockResolvedValue(later)
  await expect(reconcileRelease({ ...h.options, github })).rejects.toThrow('Tag target conflict')
  github.readTagTarget.mockResolvedValue(undefined)
  await reconcileRelease({ ...h.options, github })
  expect(remote.tags.get(keyOf(a))).toBe(source)
  expect(remote.tags.get(keyOf(b))).toBe(source)
})
