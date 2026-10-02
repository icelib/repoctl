import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { expect, it } from 'vitest'
import { withOperationLock } from '@/core/operation-lock'

it('preserves a replacement empty directory when operation lock ownership changes', async (t) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-lock-ownership-')))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const directory = path.join(root, '.repoctl')
  const retained = path.join(root, '.repoctl.retained')
  await expect(withOperationLock(root, 'doctor-fix', async () => {
    await rename(directory, retained)
    await mkdir(directory)
  })).rejects.toThrow('lock cleanup needs attention')
  expect((await lstat(directory)).isDirectory()).toBe(true)
  expect(await readFile(path.join(retained, 'doctor-fix.lock'), 'utf8')).toMatch(/^[\da-f-]+\n$/)
})
