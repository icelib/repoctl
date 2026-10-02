import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { writeDependencyTransaction } from '@/commands/deps/transaction'
import { fixture } from './fixture'

const renameMock = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, rename: renameMock }
})

it('preserves a concurrent edit and its original backup when rollback cannot safely replace the manifest', async () => {
  const h = await fixture({ 'packages/a': { dependencies: { dep: '^1' } }, 'packages/b': { dependencies: { dep: '~1' } } })
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const concurrent = '{"dependencies":{"dep":"^7"},"concurrent":true}\n'
  renameMock.mockImplementation(async (source: string, target: string) => {
    if (source.endsWith('.tmp') && target.endsWith('/packages/b/package.json')) {
      await writeFile(path.join(h.workspace, 'packages/a/package.json'), concurrent)
      throw new Error('Injected replacement failure')
    }
    return actual.rename(source, target)
  })
  const updates = await Promise.all(['packages/a/package.json', 'packages/b/package.json'].map(async file => ({ path: file, original: await readFile(path.join(h.workspace, file), 'utf8'), content: '{"dependencies":{"dep":"^1.1"}}\n' })))
  await expect(writeDependencyTransaction(h.workspace, updates)).rejects.toThrow('original backups retained')
  expect(await readFile(path.join(h.workspace, 'packages/a/package.json'), 'utf8')).toBe(concurrent)
  const backups = (await readdir(path.join(h.workspace, 'packages/a'))).filter(file => file.endsWith('.bak'))
  expect(backups).toHaveLength(1)
  expect(await readFile(path.join(h.workspace, 'packages/a', backups[0]!), 'utf8')).toBe(updates[0]!.original)
  expect(await readFile(path.join(h.workspace, 'packages/b/package.json'), 'utf8')).toBe(updates[1]!.original)
  expect(await readdir(path.join(h.workspace, 'packages/b'))).toEqual(['package.json'])
})

afterEach(() => renameMock.mockReset())

it('restores every original manifest after a later replacement fails and removes transaction files', async () => {
  const h = await fixture({ 'packages/a': { dependencies: { dep: '^1' } }, 'packages/b': { dependencies: { dep: '~1' } } })
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  renameMock.mockImplementation(async (source: string, target: string) => {
    if (source.endsWith('.tmp') && target.endsWith('/packages/b/package.json')) {
      throw new Error('Injected replacement failure')
    }
    return actual.rename(source, target)
  })
  const updates = await Promise.all(['packages/a/package.json', 'packages/b/package.json'].map(async file => ({ path: file, original: await readFile(path.join(h.workspace, file), 'utf8'), content: '{"dependencies":{"dep":"^1.1"}}\n' })))
  await expect(writeDependencyTransaction(h.workspace, updates)).rejects.toThrow('Injected replacement failure')
  for (const update of updates) {
    expect(await readFile(path.join(h.workspace, update.path), 'utf8')).toBe(update.original)
    expect(await readdir(path.dirname(path.join(h.workspace, update.path)))).toEqual(['package.json'])
  }
})
