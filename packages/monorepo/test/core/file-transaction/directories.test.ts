import { beforeEach, expect, it, vi } from 'vitest'
import { cleanDirectories } from '@/core/file-transaction/state'

const filesystem = vi.hoisted(() => ({ lstat: vi.fn(), realpath: vi.fn(), rmdir: vi.fn() }))
vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>(), ...filesystem }))

const identity = { ino: 9007199254740993n, dev: 9007199254740997n }
const directory = String.raw`C:\repo\modules\sample`

beforeEach(() => {
  vi.resetAllMocks()
  filesystem.lstat.mockResolvedValue({ ...identity, isDirectory: () => true, isSymbolicLink: () => false })
  filesystem.realpath.mockImplementation(async filename => filename)
  filesystem.rmdir.mockResolvedValue(undefined)
})

it.each([
  [directory, directory],
  ['C:/repo/modules/sample', directory],
  [String.raw`\\server\share\modules\sample`, String.raw`\\server\share\modules\sample`],
  ['//server/share/modules/sample', String.raw`\\server\share\modules\sample`],
  ['/repo/modules/sample', '/repo/modules/sample'],
])('cleans an owned empty directory across equivalent native and portable paths: %s', async (recorded, resolved) => {
  filesystem.realpath.mockResolvedValue(resolved)
  await cleanDirectories([{ path: recorded, identity }])
  expect(filesystem.lstat).toHaveBeenCalledWith(recorded, { bigint: true })
  expect(filesystem.rmdir).toHaveBeenCalledExactlyOnceWith(recorded)
})

it.each(['ino', 'dev'] as const)('retains a replacement whose large %s differs even when Number conversion collides', async (field) => {
  const changed = { ...identity, [field]: identity[field] - 1n }
  expect(Number(changed[field])).toBe(Number(identity[field]))
  filesystem.lstat.mockResolvedValue({ ...changed, isDirectory: () => true, isSymbolicLink: () => false })
  await cleanDirectories([{ path: directory, identity }])
  expect(filesystem.rmdir).not.toHaveBeenCalled()
})

it.each([
  { isDirectory: () => false, isSymbolicLink: () => false },
  { isDirectory: () => true, isSymbolicLink: () => true },
])('retains non-directory and linked replacements', async (kind) => {
  filesystem.lstat.mockResolvedValue({ ...identity, ...kind })
  await cleanDirectories([{ path: directory, identity }])
  expect(filesystem.rmdir).not.toHaveBeenCalled()
})

it('retains a canonical alias even when its final inode matches', async () => {
  filesystem.realpath.mockResolvedValue(String.raw`C:\elsewhere\sample`)
  await cleanDirectories([{ path: directory, identity }])
  expect(filesystem.rmdir).not.toHaveBeenCalled()
})

it('keeps nonempty directories and continues cleaning independent owned directories', async () => {
  filesystem.rmdir.mockRejectedValueOnce(Object.assign(new Error('Concurrent contents'), { code: 'ENOTEMPTY' }))
  const other = String.raw`C:\repo\other`
  await expect(cleanDirectories([{ path: other, identity }, { path: directory, identity }])).resolves.toBeUndefined()
  expect(filesystem.rmdir.mock.calls).toEqual([[directory], [other]])
})
