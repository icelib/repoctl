import { readFile, writeFile } from 'node:fs/promises'
import { planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { writeUpgradeTransaction } from '@/commands/upgrade/apply/transaction'
import { upgradeOperations } from '@/commands/upgrade/baseline/apply'
import { baselineFixture, recordPath } from '../baseline/fixture'
import { fixture, snapshot } from './fixture'

const renameMock = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', async original => ({ ...await original<typeof import('node:fs/promises')>(), rename: renameMock }))
afterEach(() => renameMock.mockReset())

it('rolls back additions, modifications and metadata deletions after a later replacement fails', async () => {
  const h = await fixture()
  await h.write('.changeset/pre.json', '{"mode":"pre","tag":"beta"}')
  await h.write('.changeset/config.json', '{}')
  await h.write('.editorconfig', 'original editor config\n')
  await h.write('Dockerfile', 'original docker\n')
  const plan = await planUpgrade({ cwd: h.cwd, overwrite: true })
  const before = await snapshot(h.root)
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  renameMock.mockImplementation(async (source: string, target: string) => {
    if (source.endsWith('.tmp') && target.endsWith('/Dockerfile')) {
      throw new Error('Injected upgrade replacement failure')
    }
    return actual.rename(source, target)
  })
  await expect(writeUpgradeTransaction(plan.rootDir, upgradeOperations(plan.files.filter(file => ['add', 'modify', 'delete'].includes(file.status))))).rejects.toThrow('Injected upgrade replacement failure')
  const contentOnly = (data: Record<string, string>) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value.replace(/^(\d+):[\d.]+:/, '$1:')]))
  expect(contentOnly(await snapshot(h.root))).toEqual(contentOnly(before))
})

it('retains a concurrent edit and original backup when rollback would overwrite the edit', async () => {
  const h = await fixture()
  await h.write('.editorconfig', 'original editor\n')
  await h.write('Dockerfile', 'original docker\n')
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig', 'Dockerfile'], overwrite: true })
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  renameMock.mockImplementation(async (source: string, target: string) => {
    if (source.endsWith('.tmp') && target.endsWith('/Dockerfile')) {
      await writeFile(path.join(h.cwd, '.editorconfig'), 'concurrent edit\n')
      throw new Error('Injected replacement failure')
    }
    return actual.rename(source, target)
  })
  await expect(writeUpgradeTransaction(plan.rootDir, upgradeOperations(plan.files))).rejects.toThrow('recover original files')
  expect(await readFile(path.join(h.cwd, '.editorconfig'), 'utf8')).toBe('concurrent edit\n')
  const retained = Object.keys(await snapshot(h.root)).filter(filename => filename.endsWith('.bak'))
  expect(retained).toHaveLength(1)
  expect(await readFile(path.join(h.root, retained[0]!), 'utf8')).toBe('original editor\n')
  expect(await readFile(path.join(h.cwd, 'Dockerfile'), 'utf8')).toBe('original docker\n')
})

it('restores the previous upstream baseline when a later asset replacement fails', async () => {
  const h = await baselineFixture()
  await h.seed('.editorconfig', h.upstream.replace('indent_size = 2', 'indent_size = 4'))
  await h.write('Dockerfile', 'original docker\n')
  const original = await h.read('.editorconfig')
  const baseline = await h.read(recordPath('.editorconfig'))
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig', 'Dockerfile'], overwrite: true })
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  renameMock.mockImplementation(async (source: string, target: string) => {
    if (source.endsWith('.tmp') && target.endsWith('/Dockerfile')) {
      throw new Error('Injected later failure')
    }
    return actual.rename(source, target)
  })
  await expect(writeUpgradeTransaction(plan.rootDir, upgradeOperations(plan.files))).rejects.toThrow('Injected later failure')
  expect(await h.read('.editorconfig')).toBe(original)
  expect(await h.read(recordPath('.editorconfig'))).toBe(baseline)
  expect((await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })).files[0]?.status).toBe('modify')
})
