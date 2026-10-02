import { lstat, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []

afterEach(async () => {
  vi.doUnmock('node:fs/promises')
  vi.resetModules()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('upgrade transaction cleanup races', () => {
  it('preserves a replacement transaction directory during tombstone cleanup', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-race-'))
    roots.push(root)
    let transactionDirectory: string | undefined
    let injected = false

    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return {
        ...actual,
        rename: vi.fn(async (...args: Parameters<typeof actual.rename>) => {
          const [source, destination] = args
          if (!injected && transactionDirectory && String(source) === transactionDirectory && String(destination).endsWith('.removing')) {
            injected = true
            await actual.rename(...args)
            await actual.mkdir(transactionDirectory)
            await actual.writeFile(path.join(transactionDirectory, 'sentinel.txt'), 'preserve me')
            return
          }
          return actual.rename(...args)
        }),
      }
    })

    const { beginUpgradeTransaction, completeUpgradeTransaction } = await import('@/commands/upgrade/journal')
    const handle = await beginUpgradeTransaction(root, [])
    transactionDirectory = handle.directory

    await completeUpgradeTransaction(handle)

    expect(await readFile(path.join(handle.directory, 'sentinel.txt'), 'utf8')).toBe('preserve me')
    expect(injected).toBe(true)
  })

  it('cleans a transaction directory when backup creation reports a post-create failure', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-mkdir-'))
    roots.push(root)
    let injected = false

    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return {
        ...actual,
        mkdir: vi.fn(async (...args: Parameters<typeof actual.mkdir>) => {
          const result = await actual.mkdir(...args)
          if (!injected && String(args[0]).endsWith(`${path.sep}backups`)) {
            injected = true
            throw new Error('backup directory creation interrupted')
          }
          return result
        }),
      }
    })

    const { beginUpgradeTransaction, inspectUpgradeTransactions } = await import('@/commands/upgrade/journal')
    await expect(beginUpgradeTransaction(root, [])).rejects.toThrow('backup directory creation interrupted')
    expect(injected).toBe(true)
    await expect(inspectUpgradeTransactions(root)).resolves.toEqual([])

    const repoctlDir = path.join(root, '.repoctl')
    await expect(readdir(repoctlDir)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not follow a transaction root symlink introduced before mkdir', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-root-race-'))
    const outside = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-outside-'))
    roots.push(root, outside)
    const transactionRoot = path.join(root, '.repoctl/transactions')
    let injected = false

    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return {
        ...actual,
        mkdir: vi.fn(async (...args: Parameters<typeof actual.mkdir>) => {
          if (!injected && String(args[0]) === transactionRoot) {
            injected = true
            await actual.symlink(outside, transactionRoot, 'dir')
            await actual.writeFile(path.join(outside, 'sentinel.txt'), 'preserve me')
          }
          return actual.mkdir(...args)
        }),
      }
    })

    const { beginUpgradeTransaction } = await import('@/commands/upgrade/journal')
    await expect(beginUpgradeTransaction(root, [])).rejects.toMatchObject({ code: 'EEXIST' })
    expect(injected).toBe(true)
    await expect(readFile(path.join(outside, 'sentinel.txt'), 'utf8')).resolves.toBe('preserve me')
    await expect(lstat(transactionRoot).then(info => info.isSymbolicLink())).resolves.toBe(true)
  })

  it('does not remove an empty foreign transaction directory after mkdir races', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-directory-race-'))
    roots.push(root)
    const transactionRoot = path.join(root, '.repoctl/transactions')
    let foreignDirectory: string | undefined
    let injected = false

    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return {
        ...actual,
        mkdir: vi.fn(async (...args: Parameters<typeof actual.mkdir>) => {
          const target = String(args[0])
          if (!injected && target.startsWith(`${transactionRoot}${path.sep}upgrade-`)) {
            injected = true
            foreignDirectory = target
            await actual.mkdir(target)
          }
          return actual.mkdir(...args)
        }),
      }
    })

    const { beginUpgradeTransaction } = await import('@/commands/upgrade/journal')
    await expect(beginUpgradeTransaction(root, [])).rejects.toMatchObject({ code: 'EEXIST' })
    expect(injected).toBe(true)
    expect(foreignDirectory).toBeDefined()
    const info = await lstat(foreignDirectory!)
    expect(info.isDirectory()).toBe(true)
  })
})
