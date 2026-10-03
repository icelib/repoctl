import { writeFile } from 'node:fs/promises'
import { planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyUpgradePlan } from '@/commands/upgrade/apply'
import { ledgerPath } from '@/commands/upgrade/migrations/record'
import { snapshot } from '../plan/fixture'
import { migrationFixture } from './fixture'

const renameMock = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', async original => ({ ...await original<typeof import('node:fs/promises')>(), rename: renameMock }))
beforeEach(async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  renameMock.mockImplementation(actual.rename)
})
afterEach(() => renameMock.mockReset())

it('leaves every asset unchanged when the pending ledger cannot be written', async () => {
  const h = await migrationFixture()
  await h.write(ledgerPath, '{"schemaVersion":1,"evaluatedVersion":null,"entries":{},"attempt":null}\n')
  const plan = await h.plan()
  const before = await snapshot(h.root)
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  renameMock.mockImplementation(async (source: string, target: string) => {
    if (source.endsWith('.tmp') && target.endsWith(ledgerPath)) {
      throw new Error('Cannot persist pending ledger')
    }
    return actual.rename(source, target)
  })
  await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('Cannot persist pending ledger')
  expect(await snapshot(h.root)).toEqual(before)
})

it('rolls back migration files if completing the ledger fails and safely retries the failed attempt', async () => {
  const h = await migrationFixture()
  const plan = await h.plan()
  const workspace = await h.read('pnpm-workspace.yaml')
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  let failed = false
  renameMock.mockImplementation(async (source: string, target: string) => {
    if (!failed && source.endsWith('.tmp') && target.endsWith(ledgerPath)) {
      failed = true
      throw new Error('Injected completed ledger write failure')
    }
    return actual.rename(source, target)
  })
  await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('Injected completed ledger write failure')
  expect((await h.ledger()).entries['changesets-to-pnpm-versioning']?.status).toBe('failed')
  expect((await h.ledger()).evaluatedVersion).toBeNull()
  expect(await h.read('pnpm-workspace.yaml')).toBe(workspace)
  expect(await h.read('.changeset/pre.json')).toContain('beta')
  const retry = await h.plan()
  expect(retry.status, JSON.stringify(retry.blockers)).toBe('ready')
  expect(retry.migrations?.steps[0]?.status).toBe('failed')
  await applyUpgradePlan(h.cwd, retry)
  expect((await h.ledger()).entries['changesets-to-pnpm-versioning']?.status).toBe('completed')
  expect(await h.read('unrelated.txt')).toBe('keep exactly\n')
})

it('retains pending recovery when both completed and failed ledger transitions cannot be written', async () => {
  const h = await migrationFixture()
  const plan = await h.plan()
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  renameMock.mockImplementation(async (source: string, target: string) => {
    if (source.endsWith('.tmp') && target.endsWith(ledgerPath)) {
      throw new Error('Ledger storage unavailable')
    }
    return actual.rename(source, target)
  })
  await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('failure record could not be saved')
  expect((await h.ledger()).entries['changesets-to-pnpm-versioning']?.status).toBe('pending')
  expect((await h.ledger()).evaluatedVersion).toBeNull()
  expect(await h.read('.changeset/config.json')).toContain('legacy')
  expect((await h.plan()).status).toBe('ready')
})

it('keeps concurrent user edits and verifiable original backups after migration rollback', async () => {
  const h = await migrationFixture()
  const plan = await h.plan()
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  renameMock.mockImplementation(async (source: string, target: string) => {
    if (source.endsWith('.tmp') && target.endsWith('/package.json')) {
      await writeFile(path.join(h.cwd, '.changeset/pre.json'), '{"user":"concurrent"}\n')
      throw new Error('Injected replacement failure')
    }
    return actual.rename(source, target)
  })
  await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('recover original files')
  expect(await h.read('.changeset/pre.json')).toBe('{"user":"concurrent"}\n')
  expect((await h.ledger()).entries['changesets-to-pnpm-versioning']?.status).toBe('failed')
  const backup = Object.keys(await snapshot(h.root)).find(filename => filename.includes('pre.json.repoctl-upgrade-') && filename.endsWith('.bak'))
  expect(backup).toBeDefined()
  expect(await actual.readFile(path.join(h.root, backup!), 'utf8')).toContain('beta')
  const retry = await h.plan()
  expect(retry.status).toBe('blocked')
  expect(retry.blockers.some(blocker => blocker.path === '.changeset/pre.json')).toBe(true)
})

it('reports completed migrations when a later independent asset transaction fails', async () => {
  const h = await migrationFixture()
  await h.write('.editorconfig', 'local editor settings\n')
  const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig', 'package.json', 'pnpm-workspace.yaml'], overwrite: true })
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  renameMock.mockImplementation(async (source: string, target: string) => {
    if (source.endsWith('.tmp') && target.endsWith('/.editorconfig')) {
      throw new Error('Independent asset failed')
    }
    return actual.rename(source, target)
  })
  await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('Migrations completed, but remaining selected assets failed')
  expect((await h.ledger()).entries['changesets-to-pnpm-versioning']?.status).toBe('completed')
  expect(await h.read('.editorconfig')).toBe('local editor settings\n')
  expect(await h.read('pnpm-workspace.yaml')).toContain('a: beta')
  expect((await h.plan()).migrations?.steps[0]?.status).toBe('completed')
})
