import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { runDoctor } from '@/commands/doctor'
import {
  beginUpgradeTransaction,
  markUpgradeTransactionNeedsReview,
} from '@/commands/upgrade/journal'
import fs from '@/utils/fs'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.remove(root)))
})

async function createWorkspace(prefix: string) {
  const root = await fs.mkdtemp(path.join(tmpdir(), prefix))
  roots.push(root)
  await fs.writeJSON(path.join(root, 'package.json'), {
    name: 'doctor-upgrade-workspace',
    private: true,
  })
  await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
  return root
}

describe('doctor upgrade diagnostics', () => {
  it('reports an interrupted transaction with a stable blocking check', async () => {
    const root = await createWorkspace('repoctl-doctor-upgrade-')
    const transaction = await beginUpgradeTransaction(root, [])
    await markUpgradeTransactionNeedsReview(transaction, new Error('simulated interruption'))

    const report = await runDoctor(root)
    expect(report.checks.find(check => check.id === 'upgrade-transactions')).toMatchObject({
      id: 'upgrade-transactions',
      status: 'fail',
      detail: expect.stringContaining('upgrade-'),
      fix: expect.stringContaining('inspectUpgradeTransactions'),
    })
  })

  it('reports a stale lock as recoverable warning', async () => {
    const root = await createWorkspace('repoctl-doctor-upgrade-lock-')
    const lockPath = path.join(root, '.repoctl/upgrade.lock')
    await fs.ensureDir(lockPath)
    await fs.writeJSON(path.join(lockPath, 'owner.json'), {
      schemaVersion: 1,
      id: 'stale-lock',
      pid: process.pid + 1_000_000,
      targetDir: root,
      createdAt: Date.now(),
    })

    const report = await runDoctor(root)
    expect(report.checks.find(check => check.id === 'upgrade-lock')).toMatchObject({
      id: 'upgrade-lock',
      status: 'warn',
      detail: expect.stringContaining('stale'),
      fix: expect.stringContaining('reclaim'),
    })
  })
})
