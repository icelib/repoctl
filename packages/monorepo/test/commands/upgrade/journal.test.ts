import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  beginUpgradeTransaction,
  completeUpgradeTransaction,
  discardUpgradeTransaction,
  inspectUpgradeTransactions,
  upgradeLockDirectory,
  upgradeLockMetadataFile,
} from '@/commands/upgrade/journal'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function operation(targetDir: string, before: Buffer | undefined, after: Buffer | undefined) {
  return {
    file: { path: 'managed.txt', action: 'update' as const, reason: 'test', dependsOn: [], requiresConfirmation: false },
    targetPath: path.join(targetDir, 'managed.txt'),
    before,
    after,
  }
}

describe('upgrade transaction journal', () => {
  it('persists pre-image hashes and backups while an operation is applying', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-'))
    roots.push(root)
    const handle = await beginUpgradeTransaction(root, [operation(root, Buffer.from('before'), Buffer.from('after'))])

    const pending = await inspectUpgradeTransactions(root)
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ state: 'applying', operationCount: 1, appliedCount: 0, needsReview: true })

    const journal = JSON.parse(await readFile(handle.journalPath, 'utf8')) as { operations: [{ beforeHash: string, afterHash: string, backup: string }] }
    expect(journal.operations[0].beforeHash).toMatch(/^[a-f0-9]{64}$/)
    expect(journal.operations[0].afterHash).toMatch(/^[a-f0-9]{64}$/)
    expect(journal.operations[0].backup).toBe('backups/0.bin')
    expect(await readFile(path.join(handle.directory, journal.operations[0].backup), 'utf8')).toBe('before')

    await discardUpgradeTransaction(handle)
    expect(await inspectUpgradeTransactions(root)).toEqual([])
  })

  it('blocks a second mutation until an interrupted transaction is reviewed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-'))
    roots.push(root)
    const handle = await beginUpgradeTransaction(root, [operation(root, undefined, Buffer.from('new'))])

    await expect(beginUpgradeTransaction(root, [])).rejects.toMatchObject({
      code: 'ERR_REPOCTL_UPGRADE_LOCKED',
      sameProcess: true,
    })
    await discardUpgradeTransaction(handle)
  })

  it('removes a committed journal and treats completed leftovers as safe cleanup', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-'))
    roots.push(root)
    const handle = await beginUpgradeTransaction(root, [operation(root, Buffer.from('before'), Buffer.from('after'))])
    await completeUpgradeTransaction(handle)

    expect(await inspectUpgradeTransactions(root)).toEqual([])
  })

  it('rejects operations whose target escapes the workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-'))
    roots.push(root)
    await expect(beginUpgradeTransaction(root, [{
      ...operation(root, undefined, Buffer.from('bad')),
      targetPath: path.join(root, '..', 'outside.txt'),
    }])).rejects.toThrow('escapes workspace')
  })

  it('reports corrupt and mismatched journals without changing metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-'))
    roots.push(root)
    const transactions = path.join(root, '.repoctl/transactions')
    await mkdir(path.join(transactions, 'upgrade-corrupt'), { recursive: true })
    await writeFile(path.join(transactions, 'upgrade-corrupt/journal.json'), '{invalid')
    await mkdir(path.join(transactions, 'upgrade-mismatch'), { recursive: true })
    await writeFile(path.join(transactions, 'upgrade-mismatch/journal.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'different-directory',
      pid: 1,
      targetDir: root,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      state: 'applying',
      operations: [],
    }))

    const before = await readFile(path.join(transactions, 'upgrade-corrupt/journal.json'), 'utf8')
    const inspections = await inspectUpgradeTransactions(root)
    expect(inspections).toHaveLength(2)
    expect(inspections.every(item => item.state === 'malformed' && item.needsReview)).toBe(true)
    expect(await readFile(path.join(transactions, 'upgrade-corrupt/journal.json'), 'utf8')).toBe(before)
  })

  it('rejects transaction storage that is a regular file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-'))
    roots.push(root)
    await mkdir(path.join(root, '.repoctl'), { recursive: true })
    await writeFile(path.join(root, '.repoctl/transactions'), 'not a directory')
    await expect(beginUpgradeTransaction(root, [])).rejects.toThrow('real directory')
  })

  it('takes over a lock whose recorded process is gone', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-'))
    roots.push(root)
    const lock = path.join(root, upgradeLockDirectory)
    await mkdir(lock, { recursive: true })
    await writeFile(path.join(lock, upgradeLockMetadataFile), JSON.stringify({
      schemaVersion: 1,
      id: 'stale-lock',
      pid: process.pid + 1_000_000,
      targetDir: root,
      createdAt: 0,
    }))

    const handle = await beginUpgradeTransaction(root, [])
    expect(handle.lock.id).not.toBe('stale-lock')
    await discardUpgradeTransaction(handle)
  })

  it('does not remove a malformed lock automatically', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-'))
    roots.push(root)
    const lock = path.join(root, upgradeLockDirectory)
    await mkdir(lock, { recursive: true })
    await writeFile(path.join(lock, upgradeLockMetadataFile), '{invalid')

    await expect(beginUpgradeTransaction(root, [])).rejects.toMatchObject({
      code: 'ERR_REPOCTL_UPGRADE_LOCK_MALFORMED',
    })
    expect(await readFile(path.join(lock, upgradeLockMetadataFile), 'utf8')).toBe('{invalid')
  })

  it('reports an empty lock as malformed without removing it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-journal-'))
    roots.push(root)
    const lock = path.join(root, upgradeLockDirectory)
    await mkdir(lock, { recursive: true })

    await expect(beginUpgradeTransaction(root, [])).rejects.toMatchObject({
      code: 'ERR_REPOCTL_UPGRADE_LOCK_MALFORMED',
    })
    expect(await readdir(lock)).toEqual([])
  })
})
