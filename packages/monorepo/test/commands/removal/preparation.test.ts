import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { safeFile } from '@/commands/deps/files'
import { stageFileTransaction } from '@/core/file-transaction'
import { fixture } from './fixture'

const copyFile = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', async original => ({ ...await original<typeof import('node:fs/promises')>(), copyFile }))
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
afterEach(() => copyFile.mockReset())

it.each(['backup', 'temporary'])('preserves a pre-existing %s collision without replacing the original file', async (kind) => {
  const h = await fixture()
  const file = path.join(h.workspace, 'package.json')
  const original = await readFile(file, 'utf8')
  const metadata = await stat(file)
  let collision = ''
  copyFile.mockImplementation(async (source: string, target: string, flags: number) => {
    if (kind === 'backup') {
      collision = target
      await writeFile(collision, 'other operation backup')
    }
    await actual.copyFile(source, target, flags)
    if (kind === 'temporary') {
      collision = target.replace(/\.bak$/, '.tmp')
      await writeFile(collision, 'other operation temporary')
    }
  })
  await expect(stageFileTransaction([{ path: 'package.json', original, content: '{"changed":true}\n' }], relative => safeFile(h.workspace, relative), 'remove')).rejects.toThrow('EEXIST')
  expect(await readFile(file, 'utf8')).toBe(original)
  const after = await stat(file)
  expect({ inode: after.ino, mtime: after.mtimeMs }).toEqual({ inode: metadata.ino, mtime: metadata.mtimeMs })
  expect(await readFile(collision, 'utf8')).toBe(`other operation ${kind}`)
  expect((await readdir(h.workspace)).filter(name => name.includes('.repoctl-remove-'))).toEqual([path.basename(collision)])
})
