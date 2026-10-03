import type { DependencyAdmissionConfig } from '@icebreakers/monorepo'
import { writeFile } from 'node:fs/promises'
import { checkDependencyAdmission, runDoctor } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { configure, fixture, rule, runCli, snapshot } from './fixture'

describe('admission configuration and built CLI', () => {
  it.each([
    null,
    { rules: null },
    { rules: [rule({ id: 'a,b' })] },
    { rules: [rule({ sections: [] })] },
    { rules: [rule({ workspaces: ['../outside'] })] },
    { rules: [rule({ reason: ' ' })] },
    { rules: [rule(), rule()] },
    { rules: [rule()], typo: true },
    { rules: [rule()], exceptions: [{ rule: 'browser', workspace: 'packages/web', dependency: 'legacy-sdk', section: 'dependencies' }] },
    { rules: [rule()], exceptions: [{ rule: 'browser', workspace: 'packages/web', dependency: 'legacy-sdk', section: 'dependencies', reason: 'temporary', expiresOn: '2026-02-30' }] },
  ])('rejects malformed runtime policy: %j', async (config) => {
    const h = await fixture()
    await expect(checkDependencyAdmission(h.workspace, { config: config as DependencyAdmissionConfig })).rejects.toThrow('dependencyPolicy')
  })

  it('refreshes imported configuration and rejects null values before C12 can merge them away', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { 'legacy-sdk': '^1' } } })
    await writeFile(path.join(h.workspace, 'policy.mjs'), `export default ${JSON.stringify({ rules: [rule()] })}`)
    await writeFile(path.join(h.workspace, 'repoctl.config.mjs'), 'import dependencyPolicy from "./policy.mjs"; export default { dependencyPolicy }')
    expect((await checkDependencyAdmission(h.workspace)).summary.fail).toBe(1)
    await writeFile(path.join(h.workspace, 'policy.mjs'), 'export default { rules: [] }')
    expect((await checkDependencyAdmission(h.workspace)).summary.fail).toBe(0)
    await writeFile(path.join(h.workspace, 'policy.mjs'), 'export default null')
    await expect(checkDependencyAdmission(h.workspace)).rejects.toMatchObject({ code: 'REPOCTL_CONFIG_INVALID', diagnostics: [{ path: 'dependencyPolicy' }] })
    await expect(runDoctor(h.workspace)).rejects.toMatchObject({
      code: 'REPOCTL_CONFIG_INVALID',
      message: expect.not.stringContaining(h.workspace),
      diagnostics: [{ id: 'config.invalid-type', path: 'dependencyPolicy', actualType: 'null' }],
    })
  })

  it('validates every owned config block before running admission policy', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { 'legacy-sdk': '^1' } } })
    await writeFile(path.join(h.workspace, 'repoctl.config.mjs'), `export default ${JSON.stringify({ commands: { deps: { groups: false } }, dependencyPolicy: { rules: [rule()] } })}`)
    await expect(checkDependencyAdmission(h.workspace)).rejects.toMatchObject({ code: 'REPOCTL_CONFIG_INVALID', diagnostics: [{ path: 'commands.deps.groups' }] })
  })

  it('does not execute unrelated workspace configuration with an explicit admission policy', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { 'legacy-sdk': '^1' } } })
    await writeFile(path.join(h.workspace, 'repoctl.config.mjs'), 'throw new Error("Unrelated version configuration was executed")')
    const report = await checkDependencyAdmission(h.workspace, { config: { rules: [rule()] } })
    expect(report.summary.fail).toBe(1)
    expect(report.findings).toMatchObject([
      { id: 'admission-denied', rule: 'browser', declaration: { name: 'legacy-sdk' } },
    ])
  })

  it('emits stable JSON across languages, exits on warn only with strict and integrates with doctor', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { 'legacy-sdk': '^1' } } })
    await configure(h.workspace, { rules: [rule({ severity: 'warn' })] })
    const before = await snapshot(h.root)
    const en = runCli(h, ['policy', '--json'])
    const zh = runCli(h, ['policy', '--json'], h.workspace, 'zh-CN')
    expect(en.status, en.stderr).toBe(0)
    expect(zh.status, zh.stderr).toBe(0)
    expect(JSON.parse(en.stdout)).toEqual(JSON.parse(zh.stdout))
    expect(runCli(h, ['policy', '--json', '--strict']).status).toBe(1)
    expect(runCli(h, ['policy']).stdout).toContain('Alternative: modern-sdk')
    const doctor = await runDoctor(h.workspace)
    expect(doctor.checks.find(item => item.id === 'admission-denied')).toMatchObject({ status: 'warn', detail: expect.stringContaining('dependencies.legacy-sdk') })
    expect(doctor.checks.find(item => item.id === 'admission-denied')?.detail).toContain('modern-sdk')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('fails missing or unreadable baselines, and only ignores them on explicit full checks', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { 'legacy-sdk': '^1' } } })
    await configure(h.workspace, { rules: [rule()] })
    const baseline = await checkDependencyAdmission(h.workspace)
    await writeFile(path.join(h.workspace, 'baseline.json'), JSON.stringify(baseline))
    const added = runCli(h, ['policy', '--json', '--baseline', 'baseline.json'])
    expect(added.status, added.stderr).toBe(0)
    expect(JSON.parse(added.stdout).summary).toEqual({ fail: 0, warn: 0, existing: 1, waived: 0 })
    expect(runCli(h, ['policy', '--json', '--baseline', 'missing.json']).status).toBe(1)
    expect(runCli(h, ['policy', '--json', '--baseline', 'missing.json', '--full']).status).toBe(1)
    await configure(h.workspace, { rules: [] })
    expect(runCli(h, ['policy', '--json', '--baseline', 'missing.json', '--full']).status).toBe(0)
  })

  it('keeps admission opt-in for doctor and sanitizes malformed manifest parser errors', async () => {
    const h = await fixture({ 'packages/web': { dependencies: { 'legacy-sdk': '^1' } } })
    expect((await runDoctor(h.workspace)).checks.some(item => item.id.startsWith('admission-'))).toBe(false)
    await writeFile(path.join(h.workspace, 'packages/web/package.json'), '{"token":"private-credential", "dependencies":')
    await expect(checkDependencyAdmission(h.workspace)).rejects.toThrow('Cannot read workspace manifests')
    await expect(checkDependencyAdmission(h.workspace)).rejects.not.toThrow('private-credential')
  })
})
