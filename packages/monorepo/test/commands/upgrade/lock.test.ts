import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []
const lockDirectory = '.repoctl/upgrade.lock'
const metadataFile = 'owner.json'

afterEach(async () => {
  vi.doUnmock('node:fs/promises')
  vi.resetModules()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function createRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-lock-'))
  roots.push(root)
  return root
}

async function loadLockWithOwnerWriteFailure(
  onOwnerWrite: (ownerPath: string, actual: typeof import('node:fs/promises')) => Promise<void>,
) {
  let remainingFailures = 1
  vi.doMock('node:fs/promises', async () => {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    return {
      ...actual,
      writeFile: vi.fn(async (file: string | URL, data: unknown, options?: unknown) => {
        if (remainingFailures > 0 && path.basename(String(file)) === metadataFile) {
          remainingFailures -= 1
          await onOwnerWrite(String(file), actual)
          throw new Error('owner metadata write interrupted')
        }
        return actual.writeFile(file, data as never, options as never)
      }),
    }
  })
  return import('@/commands/upgrade/journal/lock')
}

async function loadLockWithReplacementRace(root: string) {
  const lockPath = path.join(await realpath(root), lockDirectory)
  let replaced = false
  vi.doMock('node:fs/promises', async () => {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    return {
      ...actual,
      rename: vi.fn(async (source: string | URL, destination: string | URL) => {
        if (!replaced && String(source) === lockPath) {
          replaced = true
          await actual.rm(lockPath, { recursive: true, force: true })
          await actual.mkdir(lockPath)
          await actual.writeFile(path.join(lockPath, metadataFile), JSON.stringify({
            schemaVersion: 1,
            id: 'foreign-lock',
            pid: process.pid,
            targetDir: root,
            createdAt: Date.now(),
          }))
          await actual.writeFile(path.join(lockPath, 'sentinel.txt'), 'preserve me')
        }
        return actual.rename(source, destination)
      }),
    }
  })
  return import('@/commands/upgrade/journal/lock')
}

async function loadLockWithReleaseReplacementRace(root: string) {
  const lockPath = path.join(await realpath(root), lockDirectory)
  let replaced = false
  vi.doMock('node:fs/promises', async () => {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    return {
      ...actual,
      rename: vi.fn(async (source: string | URL, destination: string | URL) => {
        const result = await actual.rename(source, destination)
        if (!replaced && String(source) === lockPath && String(destination).endsWith('.releasing')) {
          replaced = true
          await actual.mkdir(lockPath)
          await actual.writeFile(path.join(lockPath, metadataFile), JSON.stringify({
            schemaVersion: 1,
            id: 'foreign-release-lock',
            pid: process.pid,
            targetDir: root,
            createdAt: Date.now(),
          }))
          await actual.writeFile(path.join(lockPath, 'sentinel.txt'), 'preserve release replacement')
        }
        return result
      }),
    }
  })
  return import('@/commands/upgrade/journal/lock')
}

describe('upgrade lock initialization recovery', () => {
  it('inspects missing, active, stale, and malformed locks without changing them', async () => {
    const root = await createRoot()
    const lock = await import('@/commands/upgrade/journal/lock')

    await expect(lock.inspectUpgradeLock(root)).resolves.toMatchObject({
      state: 'missing',
      targetDir: await realpath(root),
    })

    const lockPath = path.join(root, lockDirectory)
    await mkdir(lockPath, { recursive: true })
    const ownerPath = path.join(lockPath, metadataFile)
    await writeFile(ownerPath, JSON.stringify({
      schemaVersion: 1,
      id: 'active-lock',
      pid: process.pid,
      targetDir: root,
      createdAt: Date.now(),
    }))
    const activeBefore = await readFile(ownerPath, 'utf8')
    await expect(lock.inspectUpgradeLock(root)).resolves.toMatchObject({
      state: 'active',
      owner: { id: 'active-lock', pid: process.pid },
    })
    expect(await readFile(ownerPath, 'utf8')).toBe(activeBefore)

    await writeFile(ownerPath, JSON.stringify({
      schemaVersion: 1,
      id: 'stale-lock',
      pid: process.pid + 1_000_000,
      targetDir: root,
      createdAt: Date.now(),
    }))
    await expect(lock.inspectUpgradeLock(root)).resolves.toMatchObject({
      state: 'stale',
      owner: { id: 'stale-lock' },
    })

    await writeFile(ownerPath, '{invalid')
    await expect(lock.inspectUpgradeLock(root)).resolves.toMatchObject({
      state: 'malformed',
      reason: expect.stringContaining('metadata is invalid'),
    })
  })

  it('does not publish an empty lock when owner metadata write fails', async () => {
    const root = await createRoot()
    const lock = await loadLockWithOwnerWriteFailure(async () => {})

    await expect(lock.acquireUpgradeLock(root)).rejects.toThrow('owner metadata write interrupted')
    await expect(lstat(path.join(root, lockDirectory))).rejects.toMatchObject({ code: 'ENOENT' })
    vi.doUnmock('node:fs/promises')
    vi.resetModules()
    const recovered = await import('@/commands/upgrade/journal/lock')
    const handle = await recovered.acquireUpgradeLock(root)
    expect(handle.released).toBe(false)
    await recovered.releaseUpgradeLock(handle)
  })

  it('cleans a pending claim when another lock wins the publish race', async () => {
    const root = await createRoot()
    const lockPath = path.join(root, lockDirectory)
    await mkdir(lockPath, { recursive: true })
    await writeFile(path.join(lockPath, metadataFile), JSON.stringify({
      schemaVersion: 1,
      id: 'existing-lock',
      pid: process.pid,
      targetDir: root,
      createdAt: Date.now(),
    }))

    const lock = await import('@/commands/upgrade/journal/lock')
    await expect(lock.acquireUpgradeLock(root)).rejects.toMatchObject({
      code: 'ERR_REPOCTL_UPGRADE_LOCKED',
    })
    const pending = (await readdir(path.dirname(lockPath))).filter(name => name.startsWith(`${path.basename(lockPath)}.`) && name.endsWith('.pending'))
    expect(pending).toEqual([])
  })

  it('preserves a replacement symlink when owner metadata fails', async () => {
    const root = await createRoot()
    const foreign = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-lock-foreign-'))
    roots.push(foreign)
    const lockPath = path.join(root, lockDirectory)
    const lock = await loadLockWithOwnerWriteFailure(async (_ownerPath, actual) => {
      await actual.rm(lockPath, { recursive: true, force: true })
      await symlink(foreign, lockPath, 'dir')
    })

    await expect(lock.acquireUpgradeLock(root)).rejects.toThrow('owner metadata write interrupted')
    await expect(lstat(lockPath).then(info => info.isSymbolicLink())).resolves.toBe(true)
    await writeFile(path.join(foreign, 'sentinel.txt'), 'keep')
    await expect(readFile(path.join(foreign, 'sentinel.txt'), 'utf8')).resolves.toBe('keep')
  })

  it('preserves replacement lock metadata when owner metadata fails', async () => {
    const root = await createRoot()
    const lockPath = path.join(root, lockDirectory)
    const metadataPath = path.join(lockPath, metadataFile)
    const lock = await loadLockWithOwnerWriteFailure(async (_ownerPath, actual) => {
      await actual.rm(lockPath, { recursive: true, force: true })
      await actual.mkdir(lockPath)
      await actual.writeFile(metadataPath, '{foreign lock')
    })

    await expect(lock.acquireUpgradeLock(root)).rejects.toThrow('owner metadata write interrupted')
    await expect(readFile(metadataPath, 'utf8')).resolves.toBe('{foreign lock')
  })

  it('preserves a replacement lock when stale takeover races with another owner', async () => {
    const root = await createRoot()
    const lockPath = path.join(root, lockDirectory)
    await mkdir(lockPath, { recursive: true })
    await writeFile(path.join(lockPath, metadataFile), JSON.stringify({
      schemaVersion: 1,
      id: 'stale-lock',
      pid: process.pid + 1_000_000,
      targetDir: root,
      createdAt: Date.now(),
    }))

    const lock = await loadLockWithReplacementRace(root)
    await expect(lock.acquireUpgradeLock(root)).rejects.toMatchObject({
      code: 'ERR_REPOCTL_UPGRADE_LOCKED',
      owner: { id: 'foreign-lock', pid: process.pid },
    })
    await expect(readFile(path.join(lockPath, metadataFile), 'utf8')).resolves.toContain('foreign-lock')
    await expect(readFile(path.join(lockPath, 'sentinel.txt'), 'utf8')).resolves.toBe('preserve me')
  })

  it('preserves a replacement lock when release races with another owner', async () => {
    const root = await createRoot()
    const lock = await loadLockWithReleaseReplacementRace(root)
    const handle = await lock.acquireUpgradeLock(root)

    await lock.releaseUpgradeLock(handle)

    const lockPath = path.join(root, lockDirectory)
    await expect(readFile(path.join(lockPath, metadataFile), 'utf8')).resolves.toContain('foreign-release-lock')
    await expect(readFile(path.join(lockPath, 'sentinel.txt'), 'utf8')).resolves.toBe('preserve release replacement')
    expect(handle.released).toBe(true)
  })
})
