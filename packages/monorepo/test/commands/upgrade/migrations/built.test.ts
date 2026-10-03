import { Buffer } from 'node:buffer'
import { applyUpgradePlan, formatUpgradePlan, planUpgrade } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { upgradeOperations } from '@/commands/upgrade/baseline/apply'
import { ledgerPath } from '@/commands/upgrade/migrations/record'
import { cli, fixture, snapshot } from '../plan/fixture'
import { interruptMigration, migrationFixture } from './fixture'

describe('built versioned migration planning and application', () => {
  it('adopts recognized legacy metadata without inferring a version from dependency ranges', async () => {
    const h = await migrationFixture()
    const before = await snapshot(h.root)
    const plan = await h.plan()
    expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
    expect(plan.migrations).toMatchObject({ fromVersion: null, recovery: [], steps: [{ id: 'changesets-to-pnpm-versioning', version: '1.1.0', status: 'pending', reason: 'adopt-detected-legacy-format' }] })
    expect(formatUpgradePlan(plan)).toContain('changesets-to-pnpm-versioning @ 1.1.0')
    expect(plan.files.find(file => file.path === ledgerPath)?.diff).toContain('completed')
    expect(JSON.parse(Buffer.from(plan.migrations!.ledger!.pending, 'base64').toString()).entries['changesets-to-pnpm-versioning'].status).toBe('pending')
    expect(await snapshot(h.root)).toEqual(before)
    await applyUpgradePlan(h.cwd, plan)
    expect((await h.ledger()).entries['changesets-to-pnpm-versioning']?.status).toBe('completed')
    expect((await h.ledger()).evaluatedVersion).toBe(plan.migrations!.toVersion)
    expect((await h.ledger()).attempt).toBeNull()
    expect(await h.read('pnpm-workspace.yaml')).toContain('a: beta')
    expect(await h.read('unrelated.txt')).toBe('keep exactly\n')
    expect(await applyUpgradePlan(h.cwd, plan)).toEqual({ status: 'unchanged', changed: [] })
    expect((await h.plan()).migrations?.steps[0]?.status).toBe('completed')
  })

  it('does not record unselected migrations or initialize history for a fresh project', async () => {
    const h = await migrationFixture()
    const plan = await planUpgrade({ cwd: h.cwd, targets: ['.editorconfig'] })
    await applyUpgradePlan(h.cwd, plan, { files: ['.editorconfig'] })
    await expect(h.read(ledgerPath)).rejects.toThrow('ENOENT')
    expect(await h.read('.changeset/pre.json')).toContain('beta')
    await expect(applyUpgradePlan(h.cwd, plan, { files: [ledgerPath] })).rejects.toThrow('migration group')
    const fresh = await fixture()
    const clean = await planUpgrade({ cwd: fresh.cwd, targets: ['.editorconfig'] })
    expect(clean.migrations?.steps[0]).toMatchObject({ status: 'skipped', reason: 'legacy-format-not-present' })
    expect(clean.migrations?.ledger).toBeUndefined()
  })

  it('requires exact versions, selects crossings, and rejects downgrade and malformed legacy data', async () => {
    const h = await migrationFixture()
    const crossed = await planUpgrade({ cwd: h.cwd, fromVersion: '1.0.15' })
    expect(crossed.migrations?.steps[0]?.reason).toBe('version-boundary-crossed')
    const same = await planUpgrade({ cwd: h.cwd, fromVersion: '1.1.0' })
    expect(same.migrations?.steps[0]?.reason).toBe('version-not-crossed')
    for (const fromVersion of ['^1.0.0', '999.0.0']) {
      expect((await planUpgrade({ cwd: h.cwd, fromVersion })).status).toBe('blocked')
    }
    const output = cli(h.cwd, ['--json', '--from-version', '1.0.15'])
    expect(output.status, output.stderr).toBe(0)
    expect(JSON.parse(output.stdout).migrations.fromVersion).toBe('1.0.15')
    await h.write('.changeset/pre.json', '{bad json')
    const before = await snapshot(h.root)
    const invalid = await h.plan()
    expect(invalid.status).toBe('blocked')
    expect(invalid.blockers[0]?.id).toBe('unrecognized-legacy-format')
    expect(invalid.migrations?.ledger).toBeUndefined()
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('shows and safely resumes a mixed interrupted write without rerunning completed outputs', async () => {
    const h = await migrationFixture()
    const original = await h.plan()
    const interrupted = await interruptMigration(h, original, ['.changeset/pre.json', 'pnpm-workspace.yaml'])
    const before = await snapshot(h.root)
    const recovery = await h.plan()
    expect(recovery.status, JSON.stringify(recovery.blockers)).toBe('ready')
    expect(recovery.migrations?.recovery).toEqual(expect.arrayContaining([{ path: '.changeset/pre.json', state: 'after' }, { path: '.changeset/config.json', state: 'before' }]))
    expect(formatUpgradePlan(recovery)).toContain('already applied')
    expect(formatUpgradePlan(recovery)).toContain('pending write')
    expect(await snapshot(h.root)).toEqual(before)
    await applyUpgradePlan(h.cwd, recovery)
    expect((await h.ledger()).entries['changesets-to-pnpm-versioning']?.status).toBe('completed')
    expect((await h.ledger()).evaluatedVersion).toBe(original.migrations!.toVersion)
    expect(await h.read('pnpm-workspace.yaml')).toContain('a: beta')
    expect(Object.keys(await snapshot(h.root)).some(filename => filename.includes(interrupted.attempt!.id))).toBe(false)
    expect(await applyUpgradePlan(h.cwd, recovery)).toEqual({ status: 'unchanged', changed: [] })
  })

  it('preserves third-state user edits and recovery backups without advancing the cursor', async () => {
    const h = await migrationFixture()
    const original = await h.plan()
    await interruptMigration(h, original, ['pnpm-workspace.yaml'])
    await h.write('pnpm-workspace.yaml', 'packages: [custom/*]\n')
    const before = await snapshot(h.root)
    const recovery = await h.plan()
    expect(recovery.status).toBe('blocked')
    expect(recovery.blockers).toContainEqual(expect.objectContaining({ id: 'migration-recovery-conflict', path: 'pnpm-workspace.yaml' }))
    expect((await h.ledger()).evaluatedVersion).toBeNull()
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('recovers another interruption during recovery with its own reviewed backup paths', async () => {
    const h = await migrationFixture()
    const original = await h.plan()
    const first = await interruptMigration(h, original, ['.changeset/pre.json'])
    const recovery = await h.plan()
    const second = await interruptMigration(h, recovery, ['.changeset/config.json'])
    expect(second.attempt?.id).not.toBe(first.attempt?.id)
    const next = await h.plan()
    expect(next.status, JSON.stringify(next.blockers)).toBe('ready')
    expect(next.files.some(file => file.reason === 'migration-recovery-cleanup' && file.path.includes(first.attempt!.id))).toBe(true)
    expect(next.files.some(file => file.reason === 'migration-recovery-cleanup' && file.path.includes(second.attempt!.id))).toBe(true)
    await applyUpgradePlan(h.cwd, next)
    expect((await h.ledger()).attempt).toBeNull()
    expect(Object.keys(await snapshot(h.root)).some(filename => filename.endsWith('.bak'))).toBe(false)
  })

  it('completes an interrupted ledger after every migration output was already written', async () => {
    const h = await migrationFixture()
    const original = await h.plan()
    const pending = JSON.parse(Buffer.from(original.migrations!.ledger!.pending, 'base64').toString())
    await interruptMigration(h, original, upgradeOperations(pending.attempt.files).map(file => file.path))
    const recovery = await h.plan()
    expect(recovery.status, JSON.stringify(recovery.blockers)).toBe('ready')
    expect(recovery.migrations?.recovery.every(file => file.state === 'after')).toBe(true)
    await applyUpgradePlan(h.cwd, recovery)
    expect((await h.ledger()).evaluatedVersion).toBe(original.migrations!.toVersion)
  })

  it('applies pre-ledger saved plans without writing unaudited migration metadata', async () => {
    const h = await migrationFixture()
    const legacy = await h.plan()
    delete legacy.migrations
    legacy.files = legacy.files.filter(file => file.path !== ledgerPath)
    legacy.inputs = legacy.inputs.filter(input => !(input.area === 'target' && input.path === ledgerPath))
    await applyUpgradePlan(h.cwd, legacy)
    await expect(h.read(ledgerPath)).rejects.toThrow('ENOENT')
    expect(await h.read('pnpm-workspace.yaml')).toContain('a: beta')
  })

  it('blocks a journal whose outputs no longer match its integrity identifier', async () => {
    const h = await migrationFixture()
    const original = await h.plan()
    const interrupted = await interruptMigration(h, original, [])
    interrupted.attempt!.files[0]!.afterHash = '0'.repeat(64)
    await h.write(ledgerPath, JSON.stringify(interrupted))
    const before = await snapshot(h.root)
    expect((await h.plan()).status).toBe('blocked')
    expect(await snapshot(h.root)).toEqual(before)
  })
})
