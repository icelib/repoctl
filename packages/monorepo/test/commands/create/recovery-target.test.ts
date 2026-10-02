import { symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from '@/utils/fs'

let root: string

beforeEach(async () => {
  vi.resetModules()
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-create-recovery-'))
})

afterEach(async () => {
  vi.doUnmock('node:fs/promises')
  await fs.remove(root)
})

async function writeInterruptedTarget(options: { edited?: boolean, userFile?: boolean } = {}) {
  const targetDir = path.join(root, 'apps/demo')
  const stagingDir = await fs.mkdtemp(path.join(root, '.repoctl-create-'))
  const stale = Date.now() - 2 * 24 * 60 * 60 * 1000
  await fs.outputJson(path.join(stagingDir, '.repoctl-create.json'), {
    schemaVersion: 1,
    pid: 2 ** 31 - 1,
    cwd: root,
    targetDir,
    createdAt: stale,
  })
  await fs.outputFile(path.join(stagingDir, 'project/generated.txt'), 'generated')
  await fs.outputFile(path.join(stagingDir, 'project/nested/generated.txt'), 'nested generated')
  await fs.outputFile(path.join(targetDir, 'generated.txt'), 'generated')
  await fs.outputFile(path.join(targetDir, 'nested/generated.txt'), 'nested generated')
  if (options.edited) {
    await fs.outputFile(path.join(stagingDir, 'project/edited.txt'), 'generated')
    await fs.outputFile(path.join(targetDir, 'edited.txt'), 'user edit')
  }
  if (options.userFile) {
    await fs.outputFile(path.join(targetDir, 'user.txt'), 'user file')
  }
  const markerPath = path.join(targetDir, '.repoctl-create-target.json')
  await fs.outputJson(markerPath, {
    schemaVersion: 1,
    pid: 2 ** 31 - 1,
    cwd: root,
    targetDir,
    stagingDir,
    createdAt: stale,
  })
  return { markerPath, stagingDir, targetDir }
}

describe('create partial target recovery', () => {
  it('discards unchanged generated files and removes a fully partial target', async () => {
    const { recoverCreateTarget } = await import('@/commands/create')
    const { stagingDir, targetDir } = await writeInterruptedTarget()
    const result = await recoverCreateTarget(targetDir)
    expect(result).toMatchObject({ status: 'stale', targetRemoved: true, stagingRemoved: true })
    expect(result.removed).toContain('generated.txt')
    expect(await fs.pathExists(targetDir)).toBe(false)
    expect(await fs.pathExists(stagingDir)).toBe(false)
  })

  it('retains edited and user-added files while reporting a partial target', async () => {
    const { recoverCreateTarget } = await import('@/commands/create')
    const { markerPath, stagingDir, targetDir } = await writeInterruptedTarget({ edited: true, userFile: true })
    const result = await recoverCreateTarget(targetDir)
    expect(result.targetRemoved).toBe(false)
    expect(result.stagingRemoved).toBe(false)
    expect(result.removed).toContain('generated.txt')
    expect(result.preserved).toEqual(expect.arrayContaining(['edited.txt', 'user.txt']))
    expect(await fs.readFile(path.join(targetDir, 'edited.txt'), 'utf8')).toBe('user edit')
    expect(await fs.readFile(path.join(targetDir, 'user.txt'), 'utf8')).toBe('user file')
    expect(await fs.pathExists(path.join(targetDir, 'generated.txt'))).toBe(false)
    expect(await fs.pathExists(path.join(targetDir, 'nested/generated.txt'))).toBe(false)
    expect(await fs.pathExists(markerPath)).toBe(true)
    expect(await fs.pathExists(stagingDir)).toBe(true)
  })

  it('supports a read-only partial target recovery preview', async () => {
    const { recoverCreateTarget } = await import('@/commands/create')
    const { markerPath, stagingDir, targetDir } = await writeInterruptedTarget()
    const result = await recoverCreateTarget(targetDir, { dryRun: true })
    expect(result).toMatchObject({ dryRun: true, targetRemoved: false, stagingRemoved: false })
    expect(result.removed).toContain('generated.txt')
    expect(await fs.pathExists(path.join(targetDir, 'generated.txt'))).toBe(true)
    expect(await fs.pathExists(markerPath)).toBe(true)
    expect(await fs.pathExists(stagingDir)).toBe(true)
  })

  it('accepts a target reached through a workspace path alias', async () => {
    const { targetDir, stagingDir } = await writeInterruptedTarget()
    const aliasRoot = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-create-recovery-alias-'))
    const alias = path.join(aliasRoot, 'workspace')
    try {
      await symlink(root, alias, 'dir')
      const { recoverCreateTarget } = await import('@/commands/create')
      const result = await recoverCreateTarget(path.join(alias, 'apps/demo'), { dryRun: true })
      expect(result).toMatchObject({ status: 'stale', dryRun: true })
      expect(result.removed).toContain('generated.txt')
      expect(await fs.pathExists(targetDir)).toBe(true)
      expect(await fs.pathExists(stagingDir)).toBe(true)
    }
    finally {
      await fs.remove(aliasRoot)
    }
  })

  it('leaves a stale target untouched when the staging snapshot is missing', async () => {
    const { recoverCreateTarget } = await import('@/commands/create')
    const targetDir = path.join(root, 'apps/demo')
    await fs.outputFile(path.join(targetDir, 'user.txt'), 'keep')
    await fs.outputJson(path.join(targetDir, '.repoctl-create-target.json'), {
      schemaVersion: 1,
      pid: 2 ** 31 - 1,
      cwd: root,
      targetDir,
      stagingDir: path.join(root, '.repoctl-create-missing'),
      createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    })
    const result = await recoverCreateTarget(targetDir)
    expect(result.status).toBe('stale')
    expect(result.reason).toContain('staging snapshot')
    expect(await fs.readFile(path.join(targetDir, 'user.txt'), 'utf8')).toBe('keep')
  })

  it('restores the ownership marker when a user file appears before target removal', async () => {
    const { markerPath, targetDir } = await writeInterruptedTarget()
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return {
        ...actual,
        rmdir: vi.fn(async (entry: string) => {
          if (entry === targetDir) {
            await actual.writeFile(path.join(targetDir, 'raced.txt'), 'keep')
            const error = Object.assign(new Error('directory is not empty'), { code: 'ENOTEMPTY' })
            throw error
          }
          return actual.rmdir(entry)
        }),
      }
    })
    vi.resetModules()
    const { recoverCreateTarget } = await import('@/commands/create')
    const result = await recoverCreateTarget(targetDir)
    expect(result.targetRemoved).toBe(false)
    expect(result.reason).toContain('files added')
    expect(await fs.readFile(path.join(targetDir, 'raced.txt'), 'utf8')).toBe('keep')
    expect(await fs.pathExists(markerPath)).toBe(true)
  })

  it('rejects a nested staging path even when its marker is otherwise valid', async () => {
    const targetDir = path.join(root, 'apps/demo')
    const stagingDir = path.join(root, '.repoctl-create-parent', 'nested')
    const stale = Date.now() - 2 * 24 * 60 * 60 * 1000
    await fs.outputJson(path.join(targetDir, '.repoctl-create-target.json'), {
      schemaVersion: 1,
      pid: 2 ** 31 - 1,
      cwd: root,
      targetDir,
      stagingDir,
      createdAt: stale,
    })
    const { recoverCreateTarget } = await import('@/commands/create')
    const result = await recoverCreateTarget(targetDir)
    expect(result.status).toBe('malformed')
    expect(result.reason).toContain('staging directory')
    expect(await fs.pathExists(path.join(targetDir, '.repoctl-create-target.json'))).toBe(true)
  })

  it('stops when the target root is replaced during recovery', async () => {
    const { markerPath, targetDir } = await writeInterruptedTarget()
    const outside = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-create-replaced-'))
    await fs.outputFile(path.join(outside, 'keep.txt'), 'outside')
    const backup = `${targetDir}.backup`
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      let targetLstatCount = 0
      return {
        ...actual,
        lstat: vi.fn(async (entry: string) => {
          if (entry === targetDir) {
            targetLstatCount += 1
            if (targetLstatCount === 4) {
              await actual.rename(targetDir, backup)
              await actual.symlink(outside, targetDir)
            }
          }
          return actual.lstat(entry)
        }),
      }
    })
    vi.resetModules()
    const { recoverCreateTarget } = await import('@/commands/create')
    const result = await recoverCreateTarget(targetDir)
    expect(result.reason).toContain('target directory changed')
    expect(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe('outside')
    expect(await fs.pathExists(path.join(backup, path.basename(markerPath)))).toBe(true)
    await fs.remove(outside)
  })

  it('retains a staging directory replaced before cleanup', async () => {
    const { stagingDir, targetDir } = await writeInterruptedTarget()
    const outside = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-create-staging-replaced-'))
    await fs.outputFile(path.join(outside, 'keep.txt'), 'outside')
    const backup = `${stagingDir}.backup`
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      let replaced = false
      return {
        ...actual,
        lstat: vi.fn(async (entry: string) => {
          if (entry === stagingDir) {
            try {
              await actual.lstat(targetDir)
            }
            catch (error) {
              if (!replaced && (error as NodeJS.ErrnoException).code === 'ENOENT') {
                replaced = true
                await actual.rename(stagingDir, backup)
                await actual.symlink(outside, stagingDir)
              }
            }
            if (replaced) {
              return actual.lstat(entry)
            }
          }
          return actual.lstat(entry)
        }),
      }
    })
    vi.resetModules()
    const { recoverCreateTarget } = await import('@/commands/create')
    const result = await recoverCreateTarget(targetDir)
    expect(result.targetRemoved).toBe(true)
    expect(result.stagingRemoved).toBe(false)
    expect(result.reason).toContain('staging directory changed')
    expect(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe('outside')
    await fs.remove(outside)
  })

  it('does not recursively delete a foreign staging directory replacement', async () => {
    const { stagingDir, targetDir } = await writeInterruptedTarget()
    const outside = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-create-staging-foreign-'))
    const backup = `${stagingDir}.backup`
    await fs.outputFile(path.join(outside, 'keep.txt'), 'outside')
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      let replaced = false
      return {
        ...actual,
        rename: vi.fn(async (source: string, destination: string) => {
          if (!replaced && source === stagingDir && destination.endsWith('.removing')) {
            replaced = true
            await actual.rename(source, backup)
            await actual.rename(outside, source)
          }
          return actual.rename(source, destination)
        }),
      }
    })
    vi.resetModules()
    const { recoverCreateTarget } = await import('@/commands/create')
    const result = await recoverCreateTarget(targetDir)
    expect(result.targetRemoved).toBe(true)
    expect(result.stagingRemoved).toBe(false)
    expect(result.reason).toContain('staging cleanup was skipped')
    expect(await fs.readFile(path.join(stagingDir, 'keep.txt'), 'utf8')).toBe('outside')
    expect(await fs.pathExists(path.join(backup, '.repoctl-create.json'))).toBe(true)
    await fs.remove(stagingDir)
  })
})
