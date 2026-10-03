import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { writeDependencyTransaction } from '@/commands/deps/transaction'
import { fixture } from '../deps/fixture'

const renameMock = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, rename: renameMock }
})
afterEach(() => renameMock.mockReset())

it.each([false, true])('recovers a manifest/YAML transaction and preserves concurrent edits=%s', async (concurrent) => {
  const h = await fixture({ 'packages/a': { dependencies: { dep: '^1' } } })
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const updates = await Promise.all(['packages/a/package.json', 'pnpm-workspace.yaml'].map(async file => ({ path: file, original: await readFile(path.join(h.workspace, file), 'utf8'), content: file.endsWith('.yaml') ? 'packages: [packages/*]\ncatalog: { dep: ^1 }\n' : '{"dependencies":{"dep":"catalog:"}}\n' })))
  renameMock.mockImplementation(async (source: string, target: string) => {
    if (source.endsWith('.tmp') && target.endsWith('/pnpm-workspace.yaml')) {
      if (concurrent) {
        await writeFile(path.join(h.workspace, 'packages/a/package.json'), '{"concurrent":true}\n')
      }
      throw new Error('Injected YAML replacement failure')
    }
    return actual.rename(source, target)
  })
  await expect(writeDependencyTransaction(h.workspace, updates)).rejects.toThrow(concurrent ? 'original backups retained' : 'Injected YAML replacement failure')
  expect(await readFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'utf8')).toBe(updates[1]!.original)
  expect(await readFile(path.join(h.workspace, 'packages/a/package.json'), 'utf8')).toBe(concurrent ? '{"concurrent":true}\n' : updates[0]!.original)
  const leftovers = (await readdir(path.join(h.workspace, 'packages/a'))).filter(file => file.endsWith('.bak') || file.endsWith('.tmp'))
  expect(leftovers).toHaveLength(concurrent ? 1 : 0)
  if (concurrent) {
    expect(await readFile(path.join(h.workspace, 'packages/a', leftovers[0]!), 'utf8')).toBe(updates[0]!.original)
  }
})
