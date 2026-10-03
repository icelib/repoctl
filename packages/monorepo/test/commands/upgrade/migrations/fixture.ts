import type { UpgradePlan } from '@icebreakers/monorepo'
import type { MigrationLedger } from '@/commands/upgrade/migrations/record'
import { Buffer } from 'node:buffer'
import { readFile, rm } from 'node:fs/promises'
import { planUpgrade } from '@icebreakers/monorepo'
import path from 'pathe'
import { upgradeOperations } from '@/commands/upgrade/baseline/apply'
import { ledgerPath } from '@/commands/upgrade/migrations/record'
import { fixture } from '../plan/fixture'

export async function migrationFixture() {
  const h = await fixture()
  await h.write('.changeset/config.json', '{"changelog":"legacy"}\n')
  await h.write('.changeset/pre.json', '{"mode":"pre","tag":"beta"}\n')
  const read = (filename: string) => readFile(path.join(h.cwd, filename), 'utf8')
  const ledger = async () => JSON.parse(await read(ledgerPath)) as MigrationLedger
  const plan = () => planUpgrade({ cwd: h.cwd, targets: ['package.json', 'pnpm-workspace.yaml'] })
  return { ...h, read, ledger, plan }
}

export async function interruptMigration(h: Awaited<ReturnType<typeof migrationFixture>>, plan: UpgradePlan, paths: string[]) {
  const pending = Buffer.from(plan.migrations!.ledger!.pending, 'base64')
  const ledger = JSON.parse(pending.toString()) as MigrationLedger
  await h.write(ledgerPath, pending)
  for (const file of upgradeOperations(ledger.attempt!.files).filter(file => paths.includes(file.path))) {
    const before = await readFile(path.join(h.cwd, file.path)).catch(() => null)
    if (before !== null) {
      await h.write(`${file.path}.repoctl-upgrade-${ledger.attempt!.id}.bak`, before)
    }
    if (file.content === null) {
      await rm(path.join(h.cwd, file.path))
    }
    else {
      await h.write(file.path, Buffer.from(file.content, 'base64'))
    }
  }
  return ledger
}
