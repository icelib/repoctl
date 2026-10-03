import { mkdir, writeFile } from 'node:fs/promises'
import { inspectInstallSecurity } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it, vi } from 'vitest'
import { securityCli, securityFixture, snapshot } from './fixture'

describe('built installation policy diagnostics', () => {
  it('distinguishes omitted, explicit zero and enforced release age across pnpm versions', async () => {
    const h = await securityFixture()
    const modern = await inspectInstallSecurity(h.workspace, { pnpmVersion: '12.8.1' })
    expect(modern.settings.find(item => item.key === 'minimumReleaseAge')).toMatchObject({ configured: false, value: 1440, source: 'pnpm default' })
    expect(modern.settings.find(item => item.key === 'minimumReleaseAgeStrict')?.value).toBe(false)
    const legacy = await inspectInstallSecurity(h.workspace, { pnpmVersion: '10.25.0' })
    expect(legacy.settings.find(item => item.key === 'minimumReleaseAge')?.value).toBe(0)
    await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: []\nminimumReleaseAge: 0\n')
    const disabled = await inspectInstallSecurity(h.workspace, { pnpmVersion: '12.8.1' })
    expect(disabled.settings.find(item => item.key === 'minimumReleaseAge')).toMatchObject({ configured: true, value: 0 })
    expect(disabled.checks.find(item => item.id === 'install-security-release-age')?.detail).toContain('disabled')
    await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: []\nminimumReleaseAge: 4320\n')
    expect((await inspectInstallSecurity(h.workspace, { pnpmVersion: '12.8.1' })).settings.find(item => item.key === 'minimumReleaseAgeStrict')?.value).toBe(true)
  })

  it('retains explicit allow, deny and unreviewed decisions without running or approving scripts', async () => {
    const h = await securityFixture('allowBuilds:\n  esbuild: true\n  legacy: false\n  undecided: null\n')
    await mkdir(path.join(h.workspace, 'node_modules'))
    await writeFile(path.join(h.workspace, 'node_modules/.modules.yaml'), 'pendingBuilds: [".", "esbuild@0.28.2", "undecided@1.0.0(peer@2)"]\n')
    const before = await snapshot(h.root)
    const result = await inspectInstallSecurity(h.workspace, { pnpmVersion: '12.8.1' })
    expect(result.builds.decisions.map(item => [item.package, item.decision])).toEqual([['esbuild', 'allow'], ['legacy', 'deny'], ['undecided', 'pending']])
    expect(result.builds.pendingPackages).toEqual(['esbuild', 'undecided'])
    expect(result.builds.default).toBe('unreviewed')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('marks removed legacy settings and version-specific allowBuilds support', async () => {
    const h = await securityFixture('onlyBuiltDependencies: [esbuild]\nignoredBuiltDependencies: [legacy]\n')
    const modern = await inspectInstallSecurity(h.workspace, { pnpmVersion: '11.0.0' })
    expect(modern.settings.find(item => item.key === 'onlyBuiltDependencies')?.state).toBe('removed')
    expect(modern.builds.decisions).toEqual([])
    const legacy = await inspectInstallSecurity(h.workspace, { pnpmVersion: '10.25.0' })
    expect(legacy.builds.decisions.map(item => item.decision)).toEqual(['allow', 'deny'])
    await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: []\nallowBuilds: { esbuild: true }\n')
    expect((await inspectInstallSecurity(h.workspace, { pnpmVersion: '10.25.0' })).settings.find(item => item.key === 'allowBuilds')?.state).toBe('unsupported')
    expect((await inspectInstallSecurity(h.workspace, { pnpmVersion: '10.26.0' })).builds.decisions[0]?.decision).toBe('allow')
  })

  it('uses modern source precedence and ignores old npmrc policy while hiding credentials', async () => {
    const h = await securityFixture('minimumReleaseAge: 120\nallowBuilds:\n  "sdk@git+https://alice:token@example.invalid/sdk.git": true\n')
    await writeFile(path.join(h.home, 'config/pnpm/config.yaml'), 'minimumReleaseAge: 60\nregistry: https://alice:token@example.invalid\n')
    await writeFile(path.join(h.workspace, '.npmrc'), 'minimum-release-age=5\n//example.invalid/:_authToken=hidden-secret\n')
    vi.stubEnv('PNPM_CONFIG_MINIMUM_RELEASE_AGE', '240')
    vi.stubEnv('npm_config_trust_policy', 'no-downgrade')
    const result = await inspectInstallSecurity(h.workspace, { pnpmVersion: '12.8.1' })
    expect(result.settings.find(item => item.key === 'minimumReleaseAge')).toMatchObject({ source: 'pnpm_config environment', value: 240 })
    expect(result.checks.filter(item => item.id === 'install-security-compatibility')).toHaveLength(2)
    expect(result.builds.decisions[0]).toMatchObject({ package: 'sdk', selector: 'artifact', decision: 'allow' })
    expect(JSON.stringify(result)).not.toMatch(/alice|token|example\.invalid|hidden-secret/u)
  })

  it('fails invalid values without reflecting raw environment data', async () => {
    const h = await securityFixture()
    vi.stubEnv('PNPM_CONFIG_TRUST_POLICY', 'private-secret')
    const result = await inspectInstallSecurity(h.workspace, { pnpmVersion: '12.8.1' })
    expect(result.summary.fail).toBe(1)
    expect(JSON.stringify(result)).not.toContain('private-secret')
    expect(result.settings.find(item => item.key === 'trustPolicy')).toMatchObject({ state: 'invalid', value: null })
  })

  it('makes organization expectations and reasoned exceptions actionable under strict mode', async () => {
    const h = await securityFixture('minimumReleaseAge: 0\nminimumReleaseAgeExclude: [internal-sdk]\ntrustPolicy: off\ndangerouslyAllowAllBuilds: true\n')
    const expectations = { minimumReleaseAge: 1440, trustPolicy: 'no-downgrade' as const, requireBuildApproval: true, exceptions: [{ key: 'minimumReleaseAgeExclude' as const, package: 'internal-sdk', reason: 'Internal release channel' }] }
    await writeFile(path.join(h.workspace, 'expectations.json'), JSON.stringify(expectations))
    const result = await inspectInstallSecurity(h.workspace, { pnpmVersion: '12.8.1', expectations })
    expect(result.checks.filter(item => item.id === 'install-security-expectation')).toHaveLength(3)
    expect(result.checks.find(item => item.id === 'install-security-exception')).toMatchObject({ status: 'pass', detail: expect.stringContaining('Internal release channel') })
    const args = ['--json', '--pnpm-version', '12.8.1', '--expectations', 'expectations.json']
    const en = securityCli(h, args)
    expect(en.status, en.stderr).toBe(0)
    expect(securityCli(h, [...args, '--strict']).status).toBe(1)
    expect(JSON.parse(securityCli(h, args, 'zh-CN').stdout)).toEqual(JSON.parse(en.stdout))
  })

  it('does not claim effective policy when config dependencies or conflicting legacy sources participate', async () => {
    const h = await securityFixture('minimumReleaseAge: 120\n')
    await writeFile(path.join(h.workspace, '.npmrc'), 'minimum-release-age=5\n')
    expect((await inspectInstallSecurity(h.workspace, { pnpmVersion: '10.30.0' })).settings.find(item => item.key === 'minimumReleaseAge')?.state).toBe('unknown')
    await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: []\nconfigDependencies: { team: "1.0.0" }\n')
    expect((await inspectInstallSecurity(h.workspace, { pnpmVersion: '12.8.1' })).builds.default).toBe('unknown')
  })
})
