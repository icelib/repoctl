import { Buffer } from 'node:buffer'
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { applyUpgradeOperations, assertUpgradeParents } from '@/commands/upgrade/files'
import { inspectUpgradeTransactions } from '@/commands/upgrade/journal'
import { migrateLegacyVersioning } from '@/commands/upgrade/release-migration'
import fs from '@/utils/fs'

const unlinkImplementation = vi.hoisted(() => ({
  current: undefined as ((target: string) => Promise<void>) | undefined,
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const unlink = actual.unlink as unknown as (target: string) => Promise<void>
  return {
    ...actual,
    unlink: (target: string) => unlinkImplementation.current?.(target) ?? unlink(target),
  }
})

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  unlinkImplementation.current = undefined
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it('rolls back earlier deletions, truncated writes, and newly created directories', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-rollback-'))
  roots.push(root)
  await writeFile(path.join(root, 'old.json'), 'old')
  await writeFile(path.join(root, 'manifest.yaml'), 'original')
  const operations = [
    { name: 'old.json', before: Buffer.from('old'), after: undefined, action: 'delete' as const },
    { name: 'new/nested/file.txt', before: undefined, after: Buffer.from('new'), action: 'create' as const },
    { name: 'manifest.yaml', before: Buffer.from('original'), after: Buffer.from('changed'), action: 'update' as const },
  ].map(item => ({
    file: { path: item.name, action: item.action, reason: 'test', dependsOn: [], requiresConfirmation: false },
    targetPath: path.join(root, item.name),
    before: item.before,
    after: item.after,
  }))
  const outputFileAtomic = fs.outputFileAtomic
  vi.spyOn(fs, 'outputFileAtomic').mockImplementation(async (target, data, options) => {
    if (target.endsWith('manifest.yaml')) {
      throw new Error('disk full')
    }
    return outputFileAtomic(target, data, options)
  })
  await expect(applyUpgradeOperations(root, operations)).rejects.toThrow('disk full')
  expect(await readdir(root)).toEqual(['manifest.yaml', 'old.json'])
  expect(await fs.readFile(path.join(root, 'manifest.yaml'), 'utf8')).toBe('original')
  expect(await fs.readFile(path.join(root, 'old.json'), 'utf8')).toBe('old')
})

it('restores earlier completed deletions when a later deletion fails', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-delete-rollback-'))
  roots.push(root)
  const firstPath = path.join(root, 'first.json')
  const laterPath = path.join(root, 'later.json')
  await writeFile(firstPath, 'first')
  await writeFile(laterPath, 'later')
  const operations = [firstPath, laterPath].map(targetPath => ({
    file: { path: path.basename(targetPath), action: 'delete' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
    targetPath,
    before: Buffer.from(targetPath === firstPath ? 'first' : 'later'),
    after: undefined,
  }))
  unlinkImplementation.current = async (target) => {
    if (target === laterPath) {
      await rm(target, { force: true })
      const failure = new Error('later delete failed after removal') as NodeJS.ErrnoException
      failure.code = 'EIO'
      throw failure
    }
    await rm(target, { force: true })
  }

  await expect(applyUpgradeOperations(root, operations)).rejects.toMatchObject({ code: 'EIO' })
  expect(await fs.readFile(firstPath, 'utf8')).toBe('first')
  expect(await fs.pathExists(laterPath)).toBe(false)
})

it('keeps a partially created file and journals the unknown outcome', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-partial-create-'))
  roots.push(root)
  const targetPath = path.join(root, 'new.txt')
  const operations = [{
    file: { path: 'new.txt', action: 'create' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
    targetPath,
    before: undefined,
    after: Buffer.from('new content'),
  }]
  const outputFileAtomic = fs.outputFileAtomic
  vi.spyOn(fs, 'outputFileAtomic').mockImplementation(async (target, data, options) => {
    await outputFileAtomic(target, data, options)
    throw new Error('write completed before reporting failure')
  })

  await expect(applyUpgradeOperations(root, operations)).rejects.toThrow('write completed before reporting failure')
  expect(await readFile(targetPath, 'utf8')).toBe('new content')
  expect(await inspectUpgradeTransactions(root)).toEqual([
    expect.objectContaining({ state: 'needs-review', operationCount: 1, appliedCount: 0, needsReview: true }),
  ])
})

it('normalizes workspace paths before checking symbolic-link parents', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-parent-symlink-'))
  roots.push(root)
  const outside = await mkdtemp(path.join(tmpdir(), 'upgrade-parent-outside-'))
  roots.push(outside)
  await symlink(outside, path.join(root, 'nested'))

  await expect(assertUpgradeParents(`${root}/`, path.join(root, 'nested/file.txt'))).rejects.toThrow('symbolic link')
})

it('rechecks each target after an earlier operation so concurrent edits are rejected', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-plan-race-'))
  roots.push(root)
  const firstPath = path.join(root, 'first.json')
  const laterPath = path.join(root, 'later.json')
  await writeFile(firstPath, 'first')
  await writeFile(laterPath, 'original')
  const operations = [
    {
      file: { path: 'first.json', action: 'update' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
      targetPath: firstPath,
      before: Buffer.from('first'),
      after: Buffer.from('updated'),
    },
    {
      file: { path: 'later.json', action: 'update' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
      targetPath: laterPath,
      before: Buffer.from('original'),
      after: Buffer.from('later'),
    },
  ]
  const outputFileAtomic = fs.outputFileAtomic
  vi.spyOn(fs, 'outputFileAtomic').mockImplementation(async (target, data, options) => {
    const result = await outputFileAtomic(target, data, options)
    if (target === firstPath) {
      await writeFile(laterPath, 'user edit')
    }
    return result
  })

  await expect(applyUpgradeOperations(root, operations)).rejects.toThrow('Upgrade target changed after planning: later.json')
  expect(await fs.readFile(laterPath, 'utf8')).toBe('user edit')
  expect(await fs.readFile(firstPath, 'utf8')).toBe('first')
})

it('rejects a parent symlink inserted between upgrade operations', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-parent-race-'))
  roots.push(root)
  const outside = await mkdtemp(path.join(tmpdir(), 'upgrade-parent-race-outside-'))
  roots.push(outside)
  const firstPath = path.join(root, 'first.json')
  const laterPath = path.join(root, 'nested', 'later.json')
  await writeFile(firstPath, 'first')
  const operations = [
    {
      file: { path: 'first.json', action: 'update' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
      targetPath: firstPath,
      before: Buffer.from('first'),
      after: Buffer.from('updated'),
    },
    {
      file: { path: 'nested/later.json', action: 'create' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
      targetPath: laterPath,
      before: undefined,
      after: Buffer.from('later'),
    },
  ]
  const outputFileAtomic = fs.outputFileAtomic
  vi.spyOn(fs, 'outputFileAtomic').mockImplementation(async (target, data, options) => {
    const result = await outputFileAtomic(target, data, options)
    if (target === firstPath) {
      await symlink(outside, path.join(root, 'nested'))
    }
    return result
  })

  await expect(applyUpgradeOperations(root, operations)).rejects.toThrow('symbolic link')
  expect(await fs.readFile(firstPath, 'utf8')).toBe('first')
  expect(await fs.pathExists(path.join(outside, 'later.json'))).toBe(false)
})

it('does not delete legacy state when writing lanes fails', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'upgrade-lanes-failure-'))
  roots.push(root)
  await fs.outputJson(path.join(root, '.changeset/config.json'), {})
  await fs.outputJson(path.join(root, '.changeset/pre.json'), { mode: 'pre', tag: 'beta' })
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
  vi.spyOn(fs, 'outputFileAtomic').mockRejectedValue(new Error('permission denied'))
  await expect(migrateLegacyVersioning(root)).rejects.toThrow('permission denied')
  expect(await fs.pathExists(path.join(root, '.changeset/pre.json'))).toBe(true)
  expect(await fs.pathExists(path.join(root, '.changeset/config.json'))).toBe(true)
  expect(await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe('packages: []\n')
})
