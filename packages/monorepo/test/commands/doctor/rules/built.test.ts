import { getDoctorRuleIds, runDoctor } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import fs from '@/utils/fs'
import { cli, fixture } from './fixture'

describe('built doctor rule selection and suppression', () => {
  it('selects exact stable IDs before unrelated tooling reads, from child directories', async () => {
    const h = await fixture({ packageManager: 'pnpm@12.8.1' })
    await fs.ensureDir(path.join(h.root, 'eslint.config.js'))
    const report = await runDoctor(h.cwd, { rules: ['package-manager', 'root-scripts', 'package-manager'] })
    expect(report.checks.map(check => check.id)).toEqual(['package-manager', 'root-scripts'])
    expect(report.summary).toEqual({ pass: 1, warn: 1, fail: 0 })
    expect((await runDoctor(h.cwd, { rules: [] })).checks).toEqual([])
    await expect(runDoctor(h.cwd, { rules: ['root-script'] })).rejects.toThrow(/Available:.*root-scripts/)
    const listed = cli(h.cwd, ['--list-rules'])
    expect(listed.status, listed.stderr).toBe(0)
    expect(JSON.parse(listed.stdout)).toEqual(getDoctorRuleIds())
    expect(new Set(getDoctorRuleIds()).size).toBe(getDoctorRuleIds().length)
  })

  it('keeps reasons, original statuses, raw totals and expired waivers in strict CLI reports', async () => {
    const h = await fixture()
    const write = (expires: string) => fs.writeFile(path.join(h.root, 'repoctl.config.mjs'), `export default {commands:{doctor:{rules:['root-scripts'],suppressions:[{id:'root-scripts',reason:'Migration window',expires:'${expires}'}]}}}`)
    await write('2099-12-31')
    const active = cli(h.cwd, ['--json', '--strict'])
    expect(active.status, active.stderr).toBe(0)
    expect(JSON.parse(active.stdout)).toMatchObject({
      summary: { pass: 0, warn: 0, fail: 0 },
      rawSummary: { pass: 0, warn: 1, fail: 0 },
      checks: [{ id: 'root-scripts', status: 'warn', suppression: { state: 'active', reason: 'Migration window', expires: '2099-12-31' } }],
      suppressions: [{ matched: 1, state: 'active' }],
    })
    await write('2000-01-01')
    const expired = cli(h.cwd, ['--json', '--strict'])
    expect(expired.status).toBe(1)
    expect(JSON.parse(expired.stdout)).toMatchObject({ summary: { warn: 1 }, checks: [{ status: 'warn', suppression: { state: 'expired' } }] })
    expect(cli(h.cwd, ['--markdown']).stdout).toContain('Migration window')
    expect(cli(h.cwd, []).stdout).toContain('2000-01-01')
  })

  it('uses exact manifest paths for waivers and lets CLI selection override config defaults', async () => {
    const h = await fixture({ version: 'invalid' })
    await fs.outputJson(path.join(h.root, 'packages/app/package.json'), { name: 'app', private: true, version: 'invalid' })
    await fs.writeFile(path.join(h.root, 'repoctl.config.mjs'), `export default {commands:{doctor:{rules:['root-scripts']}}}`)
    const report = await runDoctor(h.cwd, { rules: ['manifest-version-invalid'], suppressions: [{ id: 'manifest-version-invalid', path: 'package.json', reason: 'Root is unpublished' }] })
    expect(report.checks).toHaveLength(2)
    expect(report.rawSummary?.fail).toBe(2)
    expect(report.summary.fail).toBe(1)
    expect(report.checks.find(check => check.path === 'packages/app/package.json')?.suppression).toBeUndefined()
    const selected = cli(h.cwd, ['--rules', 'package-json', '--json'])
    expect(JSON.parse(selected.stdout).checks.map((check: { id: string }) => check.id)).toEqual(['package-json'])
  })

  it.each([
    { id: 'no-such-rule', reason: 'typo' },
    { id: 'root-scripts', reason: ' ' },
    { id: 'root-scripts', reason: 'temporary', expires: '2026-02-30' },
    { id: 'root-scripts', reason: 'temporary', path: '../package.json' },
    { id: 'root-scripts', reason: 'temporary', expiresAt: '2000-01-01' },
  ])('rejects invalid suppression %j', async (suppression) => {
    const h = await fixture()
    await expect(runDoctor(h.cwd, { suppressions: [suppression] })).rejects.toThrow(/suppression/i)
  })

  it('reports unmatched and expired waivers without inventing findings', async () => {
    const h = await fixture()
    const report = await runDoctor(h.cwd, { rules: ['package-json'], suppressions: [{ id: 'root-scripts', reason: 'Old waiver', expires: '2000-01-01' }] })
    expect(report.suppressions).toEqual([{ id: 'root-scripts', reason: 'Old waiver', expires: '2000-01-01', state: 'expired', matched: 0 }])
    expect(report.summary).toEqual({ pass: 1, warn: 0, fail: 0 })
  })
})
