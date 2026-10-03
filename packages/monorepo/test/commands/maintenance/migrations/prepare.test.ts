import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { planUpgrade, prepareMaintenanceUpgrade } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { fixture } from '../fixture'
import { ledgerPath, migrationFixture } from './fixture'

it.each([false, true])('prepares legacy Changesets migration and its completed ledger: prerelease=%s', async (prerelease) => {
  const h = await migrationFixture({ prerelease, history: true })
  const report = await prepareMaintenanceUpgrade(h.settings)
  expect(report.status, report.errors.join()).toBe('ready')
  const ledger = JSON.parse(await readFile(path.join(h.cwd, ledgerPath), 'utf8'))
  const templateVersion = JSON.parse(await readFile(path.join(report.plan!.assetDir, '../package.json'), 'utf8')).version
  expect(ledger.evaluatedVersion).toBe(templateVersion)
  expect(ledger.entries['older-migration']).toEqual(h.history.entries['older-migration'])
  expect(ledger.entries['changesets-to-pnpm-versioning']).toEqual({ version: '1.1.0', status: 'completed', fromVersion: '0.5.0', toVersion: templateVersion })
  expect(ledger.attempt).toBeNull()
  expect(report.files.map(file => file.path)).toContain(ledgerPath)
  expect(report.checks.map(check => check.name)).toEqual(['lockfile', 'install', 'build', 'lint', 'typecheck', 'tsd', 'test'])
  await expect(readFile(path.join(h.cwd, '.changeset/config.json'))).rejects.toThrow('ENOENT')
  if (prerelease) {
    await expect(readFile(path.join(h.cwd, '.changeset/pre.json'))).rejects.toThrow('ENOENT')
    expect(await readFile(path.join(h.cwd, 'pnpm-workspace.yaml'), 'utf8')).toContain('\'@example/public\': beta')
  }
})
it('keeps modern maintenance ready without writing a migration ledger', async () => {
  const h = await fixture()
  const report = await prepareMaintenanceUpgrade(h.options)
  expect(report.status, report.errors.join()).toBe('ready')
  expect(report.plan?.migrations?.steps[0]?.reason).toBe('legacy-format-not-present')
  expect(report.files.map(file => file.path)).not.toContain(ledgerPath)
  await expect(readFile(path.join(h.cwd, ledgerPath))).rejects.toThrow('ENOENT')
})
it.each(['pending', 'failed'] as const)('keeps a committed %s migration journal for manual recovery', async (status) => {
  const h = await migrationFixture()
  const plan = await planUpgrade({ cwd: h.cwd, outDir: '.', overwriteRelease: false })
  expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
  await h.write(ledgerPath, Buffer.from(plan.migrations!.ledger![status], 'base64').toString())
  h.git(['add', ledgerPath])
  h.git(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'retain interrupted migration'])
  const report = await prepareMaintenanceUpgrade({ ...h.settings, head: h.git(['rev-parse', 'HEAD']) })
  expect(report.status).toBe('blocked')
  expect(report.errors.join()).toContain('interrupted migrations require a reviewed manual upgrade')
  expect(h.calls).toEqual([])
  expect(h.git(['status', '--porcelain'])).toBe('')
  expect(await readFile(path.join(h.cwd, '.changeset/config.json'), 'utf8')).toContain('{}')
})
