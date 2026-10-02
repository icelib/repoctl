import { lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { withOperationLock } from '@/core/operation-lock'

const unlinkMock = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', async original => ({ ...await original<typeof import('node:fs/promises')>(), unlink: unlinkMock }))
afterEach(() => unlinkMock.mockReset())

it('preserves a replacement empty directory after releasing its own operation lock', async (t) => {
  const root = path.normalize(await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-lock-ownership-'))))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const directory = path.join(root, '.repoctl')
  const retained = path.join(root, '.repoctl.retained')
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  unlinkMock.mockImplementation(async (filename: string) => {
    await actual.unlink(filename)
    // Windows permits replacing this directory only after the lock handle closes.
    await rename(directory, retained)
    await mkdir(directory)
  })
  await expect(withOperationLock(root, 'doctor-fix', async () => 'completed')).resolves.toBe('completed')
  expect(unlinkMock).toHaveBeenCalledOnce()
  expect((await lstat(directory)).isDirectory()).toBe(true)
  expect((await lstat(retained)).isDirectory()).toBe(true)
})
