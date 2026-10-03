import { readFile, rm, writeFile } from 'node:fs/promises'
import { applyUpgradePlan } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { withOperationLock } from '@/core/operation-lock'
import { snapshot } from '../plan/fixture'
import { migrationFixture } from './fixture'

it('refuses concurrent built apply and removes only the lock token it owns', async () => {
  const h = await migrationFixture()
  const plan = await h.plan()
  await withOperationLock(plan.rootDir, 'upgrade', async () => {
    const before = await snapshot(h.root)
    await expect(applyUpgradePlan(h.cwd, plan)).rejects.toThrow('Operation upgrade is locked')
    expect(await snapshot(h.root)).toEqual(before)
  })
  const lock = path.join(plan.rootDir, '.repoctl/upgrade.lock')
  await expect(readFile(lock)).rejects.toThrow('ENOENT')
  try {
    await expect(withOperationLock(plan.rootDir, 'upgrade', async () => {
      await writeFile(lock, '{"token":"another-owner"}\n')
    })).rejects.toThrow('lock cleanup needs attention')
    expect(await readFile(lock, 'utf8')).toContain('another-owner')
  }
  finally {
    await rm(lock, { force: true })
  }
})
