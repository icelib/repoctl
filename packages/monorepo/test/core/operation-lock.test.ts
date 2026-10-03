import { lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { withOperationLock } from '@/core/operation-lock'

const { unlinkMock, lstatMock } = vi.hoisted(() => ({ unlinkMock: vi.fn(), lstatMock: vi.fn() }))
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, unlink: unlinkMock, lstat: (...args: Parameters<typeof actual.lstat>) => lstatMock.getMockImplementation() ? lstatMock(...args) : actual.lstat(...args) }
})
afterEach(() => {
  unlinkMock.mockReset()
  lstatMock.mockReset()
})

it.each([false, true])('preserves a replacement empty directory after releasing its own operation lock (large file identity: %s)', async (largeIdentity) => {
  const root = path.normalize(await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-lock-ownership-'))))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const directory = path.join(root, '.repoctl')
  const retained = path.join(root, '.repoctl.retained')
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  let replaced = false
  const identities: Array<{ dev: string, ino: string }> = []
  if (largeIdentity) {
    lstatMock.mockImplementation(async (filename: string, options?: { bigint?: boolean }) => {
      const stat = await actual.lstat(filename, options)
      if (path.normalize(filename) === directory) {
        // Adjacent Windows file IDs can have the same Number representation.
        const identity = replaced ? 9007199254740993n : 9007199254740992n
        Object.defineProperty(stat, 'ino', { value: options?.bigint ? identity : Number(identity) })
      }
      return stat
    })
  }
  unlinkMock.mockImplementation(async (filename: string) => {
    await actual.unlink(filename)
    const before = await lstat(directory, { bigint: true })
    identities.push({ dev: before.dev.toString(), ino: before.ino.toString() })
    // Windows permits replacing this directory only after the lock handle closes.
    await rename(directory, retained)
    await mkdir(directory)
    replaced = true
    const after = await lstat(directory, { bigint: true })
    identities.push({ dev: after.dev.toString(), ino: after.ino.toString() })
  })
  await expect(withOperationLock(root, 'doctor-fix', async () => 'completed')).resolves.toBe('completed')
  expect(unlinkMock).toHaveBeenCalledOnce()
  expect(await lstat(directory).then(stat => stat.isDirectory(), error => (error as Error).message), JSON.stringify({ largeIdentity, identities })).toBe(true)
  expect((await lstat(retained)).isDirectory()).toBe(true)
})
