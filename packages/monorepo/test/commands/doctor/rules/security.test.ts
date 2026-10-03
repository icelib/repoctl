import { getDoctorRuleIds, runDoctor } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import fs from '@/utils/fs'
import { securityFixture } from '../security/fixture'
import { cli } from './fixture'

describe('built installation security with selected doctor rules', () => {
  it('includes security in the default registry and selects its stable IDs', async () => {
    const h = await securityFixture('minimumReleaseAge: 0\n')
    const ids = ['install-security-version', 'install-security-release-age', 'install-security-trust', 'install-security-builds']
    expect(getDoctorRuleIds()).toEqual(expect.arrayContaining(ids))
    expect((await runDoctor(h.workspace)).checks.map(check => check.id)).toEqual(expect.arrayContaining(ids))
    const report = await runDoctor(h.workspace, { rules: ['install-security-release-age'] })
    expect(report.checks).toEqual([expect.objectContaining({ id: 'install-security-release-age', detail: expect.stringContaining('release waiting is disabled') })])
    const selected = cli(h.workspace, ['--rules', 'install-security-release-age', '--json'])
    expect(selected.status, selected.stderr).toBe(0)
    expect(JSON.parse(selected.stdout).checks).toEqual(report.checks)
  })

  it('retains security suppression reasons and raw failures while keeping the subcommand available', async () => {
    const h = await securityFixture('minimumReleaseAge: 0\n')
    await fs.writeFile(path.join(h.workspace, 'repoctl.config.mjs'), 'export default { installationSecurity: {minimumReleaseAge: 1440, severity: "fail"} }')
    const report = await runDoctor(h.workspace, {
      rules: ['install-security-expectation'],
      suppressions: [{ id: 'install-security-expectation', reason: 'Approved migration window' }],
    })
    expect(report.checks).toEqual([expect.objectContaining({ id: 'install-security-expectation', status: 'fail', suppression: expect.objectContaining({ reason: 'Approved migration window', state: 'active' }) })])
    expect(report.rawSummary?.fail).toBe(1)
    expect(report.summary.fail).toBe(0)
    const security = cli(h.workspace, ['security', '--json'])
    expect(security.status).toBe(1)
    expect(JSON.parse(security.stdout)).toMatchObject({ kind: 'install-security', summary: { fail: 1 } })
  })

  it('rejects parent fix modes and preserves inherited report flags for the security subcommand', async () => {
    const h = await securityFixture()
    for (const parentOptions of [['--fix'], ['--list-rules'], ['--rules', 'package-json']]) {
      const result = cli(h.workspace, [...parentOptions, 'security', '--json'])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('parent doctor rule selection or fix operations')
    }
    const plan = path.join(h.workspace, 'doctor-plan.json')
    await fs.writeJson(plan, { schemaVersion: 1, kind: 'doctor-fix', files: [] })
    const rejected = cli(h.workspace, ['--apply', plan, 'security', '--json'])
    expect(rejected.status).toBe(1)
    expect(rejected.stderr).toContain('Invalid installation security preset plan')
    const report = cli(h.workspace, ['--json', 'security'])
    expect(report.status, report.stderr).toBe(0)
    expect(JSON.parse(report.stdout).kind).toBe('install-security')
  })

  it('does not load unrelated security expectations for an explicit workspace-only selection', async () => {
    const h = await securityFixture()
    await fs.writeFile(path.join(h.workspace, 'repoctl.config.mjs'), 'export default { installationSecurity: {unknown: true} }')
    const selected = await runDoctor(h.workspace, { rules: ['package-json'] })
    expect(selected.checks).toEqual([expect.objectContaining({ id: 'package-json', status: 'pass' })])
    const security = await runDoctor(h.workspace, { rules: ['install-security-config'] })
    expect(security.checks).toEqual([expect.objectContaining({ id: 'install-security-config', status: 'fail' })])
  })
})
