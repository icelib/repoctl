import { Buffer } from 'node:buffer'
import path from 'pathe'
import { expect, it } from 'vitest'
import { ledgerPath } from '@/commands/upgrade/migrations/record'
import { hash } from '@/core/file-transaction/paths'
import { sharedInstalledPackage } from '../plan/fixture'
import { instrument } from '../plan/instrument'
import { interruptMigration, migrationFixture } from './fixture'

it.each(['unchanged', 'changed'])('recovers legacy template manifest inputs with %s source hashes', async (kind) => {
  const h = await migrationFixture()
  const plan = await h.plan()
  const pending = JSON.parse(Buffer.from(plan.migrations!.ledger!.pending, 'base64').toString())
  const metadata = pending.attempt.inputs.find((input: { area: string }) => input.area === 'package')
  metadata.area = 'config'
  metadata.path = path.resolve(plan.assetDir, '../package.json')
  if (kind === 'changed') {
    metadata.hash = '0'.repeat(64)
  }
  const { files, inputs, discovery } = pending.attempt
  pending.attempt.id = hash(Buffer.from(JSON.stringify({ files, inputs, discovery })))
  plan.migrations!.ledger!.pending = Buffer.from(JSON.stringify(pending)).toString('base64')
  await interruptMigration(h, plan, ['pnpm-workspace.yaml'])
  const output = await instrument(plan, sharedInstalledPackage, `
    const { planUpgrade } = await import(entry)
    const resumed = await planUpgrade({ cwd: root, targets: ['package.json', 'pnpm-workspace.yaml'] })
    if (resumed.status !== 'ready') throw new Error(JSON.stringify(resumed.blockers))
    if (resumed.inputs.filter(input => input.area === 'package').length !== 1
      || resumed.inputs.some(input => input.area === 'config' && input.path === path.resolve(plan.assetDir, '../package.json'))) {
      throw new Error('Recovery did not normalize the legacy package input')
    }
    await applyUpgradePlan(root, resumed)
  `)
  if (kind === 'changed') {
    expect(output).toContain('migration-recovery-conflict')
    expect((await h.ledger()).attempt?.id).toBe(pending.attempt.id)
    expect(await h.read(`pnpm-workspace.yaml.repoctl-upgrade-${pending.attempt.id}.bak`)).toContain('packages:')
  }
  else {
    expect(output).toBe('applied')
    expect((await h.ledger()).attempt).toBeNull()
    expect(await h.read(ledgerPath)).not.toContain(metadata.path)
    await expect(h.read(`pnpm-workspace.yaml.repoctl-upgrade-${pending.attempt.id}.bak`)).rejects.toThrow()
  }
})
