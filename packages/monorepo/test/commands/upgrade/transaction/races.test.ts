import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { applyUpgradeOperations } from '@/commands/upgrade/files'
import { inspectUpgradeTransactions } from '@/commands/upgrade/journal'
import fs from '@/utils/fs'

const unlinkImplementation = vi.hoisted(() => ({
  current: undefined as ((target: string) => Promise<void>) | undefined,
}))
const mkdirImplementation = vi.hoisted(() => ({
  current: undefined as ((target: string, options: Parameters<typeof import('node:fs/promises')['mkdir']>[1]) => Promise<string | undefined>) | undefined,
  original: undefined as typeof import('node:fs/promises')['mkdir'] | undefined,
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  mkdirImplementation.original = actual.mkdir
  const unlink = actual.unlink as unknown as (target: string) => Promise<void>
  return {
    ...actual,
    unlink: (target: string) => unlinkImplementation.current?.(target) ?? unlink(target),
    mkdir: (target: string, options: Parameters<typeof actual.mkdir>[1]) => mkdirImplementation.current?.(target, options) ?? actual.mkdir(target, options),
  }
})

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  unlinkImplementation.current = undefined
  mkdirImplementation.current = undefined
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it('preserves a user edit made before a later operation fails', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-concurrent-edit-'))
  roots.push(root)
  const managedPath = path.join(root, 'managed.json')
  const laterPath = path.join(root, 'later.json')
  await writeFile(managedPath, 'original')
  const operations = [
    {
      file: { path: 'managed.json', action: 'update' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
      targetPath: managedPath,
      before: Buffer.from('original'),
      after: Buffer.from('managed'),
    },
    {
      file: { path: 'later.json', action: 'create' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
      targetPath: laterPath,
      before: undefined,
      after: Buffer.from('later'),
    },
  ]
  const outputFileAtomic = fs.outputFileAtomic
  vi.spyOn(fs, 'outputFileAtomic').mockImplementation(async (target, data, options) => {
    if (target === managedPath) {
      await outputFileAtomic(target, data, options)
      await writeFile(target, 'user edit')
      return
    }
    if (target === laterPath) {
      throw new Error('disk full')
    }
    return outputFileAtomic(target, data, options)
  })

  await expect(applyUpgradeOperations(root, operations)).rejects.toThrow('disk full')
  expect(await fs.readFile(managedPath, 'utf8')).toBe('user edit')
  expect(await fs.pathExists(laterPath)).toBe(false)
})

it('preserves a user edit when the operation that fails was already started', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-failed-concurrent-edit-'))
  roots.push(root)
  const managedPath = path.join(root, 'managed.json')
  const laterPath = path.join(root, 'later.json')
  await writeFile(managedPath, 'original')
  const operations = [
    {
      file: { path: 'managed.json', action: 'update' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
      targetPath: managedPath,
      before: Buffer.from('original'),
      after: Buffer.from('managed'),
    },
    {
      file: { path: 'later.json', action: 'create' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
      targetPath: laterPath,
      before: undefined,
      after: Buffer.from('later'),
    },
  ]
  const outputFileAtomic = fs.outputFileAtomic
  vi.spyOn(fs, 'outputFileAtomic').mockImplementation(async (target, data, options) => {
    if (target === managedPath) {
      // Simulate a non-atomic implementation or an external writer racing
      // with the failed operation. The rollback must leave the edit intact.
      await writeFile(target, 'user edit')
      throw new Error('disk full')
    }
    return outputFileAtomic(target, data, options)
  })

  await expect(applyUpgradeOperations(root, operations)).rejects.toThrow('disk full')
  expect(await fs.readFile(managedPath, 'utf8')).toBe('user edit')
  expect(await fs.pathExists(laterPath)).toBe(false)
})

it('does not recreate a file when a delete races with a user removal', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-delete-race-'))
  roots.push(root)
  const targetPath = path.join(root, 'legacy.json')
  await writeFile(targetPath, 'legacy')
  const operations = [{
    file: { path: 'legacy.json', action: 'delete' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
    targetPath,
    before: Buffer.from('legacy'),
    after: undefined,
  }]
  unlinkImplementation.current = async (target) => {
    await rm(target, { force: true })
    const failure = new Error('delete raced with user removal') as NodeJS.ErrnoException
    failure.code = 'ENOENT'
    throw failure
  }

  await expect(applyUpgradeOperations(root, operations)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await fs.pathExists(targetPath)).toBe(false)
})

it('preserves a user replacement after a completed deletion and keeps the journal', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-delete-replacement-'))
  roots.push(root)
  const firstPath = path.join(root, 'first.json')
  const laterPath = path.join(root, 'later.json')
  await writeFile(firstPath, 'first')
  await writeFile(laterPath, 'later')
  const operations = [
    {
      file: { path: 'first.json', action: 'delete' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
      targetPath: firstPath,
      before: Buffer.from('first'),
      after: undefined,
    },
    {
      file: { path: 'later.json', action: 'delete' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
      targetPath: laterPath,
      before: Buffer.from('later'),
      after: undefined,
    },
  ]
  unlinkImplementation.current = async (target) => {
    if (target === firstPath) {
      await rm(target, { force: true })
      await writeFile(target, 'user replacement')
      return
    }
    const failure = new Error('later delete failed') as NodeJS.ErrnoException
    failure.code = 'EIO'
    throw failure
  }

  await expect(applyUpgradeOperations(root, operations)).rejects.toMatchObject({ code: 'EIO' })
  expect(await fs.readFile(firstPath, 'utf8')).toBe('user replacement')
  expect(await inspectUpgradeTransactions(root)).toEqual([
    expect.objectContaining({ state: 'needs-review', needsReview: true }),
  ])
})

it('rechecks unchanged migration dependencies before each operation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-dependency-race-'))
  roots.push(root)
  const firstPath = path.join(root, 'first.json')
  const laterPath = path.join(root, 'later.json')
  const dependencyPath = path.join(root, 'workspace.yaml')
  await writeFile(firstPath, 'first')
  await writeFile(laterPath, 'later')
  await writeFile(dependencyPath, 'planned')
  const operations = [
    {
      file: { path: 'first.json', action: 'update' as const, reason: 'legacy-release', dependsOn: ['workspace.yaml'], requiresConfirmation: true },
      targetPath: firstPath,
      before: Buffer.from('first'),
      after: Buffer.from('updated'),
    },
    {
      file: { path: 'later.json', action: 'update' as const, reason: 'legacy-release', dependsOn: ['workspace.yaml'], requiresConfirmation: true },
      targetPath: laterPath,
      before: Buffer.from('later'),
      after: Buffer.from('changed'),
    },
  ]
  const dependency = {
    file: { path: 'workspace.yaml', action: 'skip' as const, reason: 'identical', dependsOn: [], requiresConfirmation: false },
    targetPath: dependencyPath,
    before: Buffer.from('planned'),
    after: Buffer.from('planned'),
  }
  const outputFileAtomic = fs.outputFileAtomic
  vi.spyOn(fs, 'outputFileAtomic').mockImplementation(async (target, data, options) => {
    const result = await outputFileAtomic(target, data, options)
    if (target === firstPath) {
      await writeFile(dependencyPath, 'user edit')
    }
    return result
  })

  await expect(applyUpgradeOperations(root, operations, [dependency])).rejects.toThrow('Upgrade dependency changed after planning: workspace.yaml')
  expect(await fs.readFile(firstPath, 'utf8')).toBe('first')
  expect(await fs.readFile(dependencyPath, 'utf8')).toBe('user edit')
  expect(await fs.readFile(laterPath, 'utf8')).toBe('later')
})

it('rejects a parent replaced with a symlink after mkdir before publishing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-parent-symlink-race-'))
  roots.push(root)
  const outside = await mkdtemp(path.join(tmpdir(), 'upgrade-parent-symlink-outside-'))
  roots.push(outside)
  const parent = path.join(root, 'nested')
  const targetPath = path.join(parent, 'managed.json')
  const { symlink, rm: remove } = await import('node:fs/promises')
  mkdirImplementation.current = async (target, options) => {
    const created = await mkdirImplementation.original!(target, options)
    if (target === parent) {
      await remove(parent, { recursive: true, force: true })
      await symlink(outside, parent, 'dir')
    }
    return created as string | undefined
  }

  const operations = [{
    file: { path: 'nested/managed.json', action: 'create' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
    targetPath,
    before: undefined,
    after: Buffer.from('managed'),
  }]

  await expect(applyUpgradeOperations(root, operations)).rejects.toThrow('could not fully restore')
  expect(await fs.pathExists(path.join(outside, 'managed.json'))).toBe(false)
})
