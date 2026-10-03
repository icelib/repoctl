import { mkdir, writeFile } from 'node:fs/promises'
import { inspectInstallSecurity } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it, vi } from 'vitest'
import { securityCli, securityFixture, snapshot } from './fixture'

describe('installation security configuration boundaries', () => {
  it('refreshes imported expectations without caches or source writes', async () => {
    const h = await securityFixture('minimumReleaseAge: 0\n')
    await mkdir(path.join(h.workspace, 'node_modules'))
    const helper = path.join(h.workspace, 'security-policy.mjs')
    await writeFile(helper, 'export default { minimumReleaseAge: 1440 }')
    await writeFile(path.join(h.workspace, 'repoctl.config.mjs'), 'import installationSecurity from \'./security-policy.mjs\'; export default { installationSecurity }')
    const before = await snapshot(h.root)
    expect((await inspectInstallSecurity(h.workspace)).checks.some(check => check.id === 'install-security-expectation')).toBe(true)
    expect(await snapshot(h.root)).toEqual(before)
    await writeFile(helper, 'export default { minimumReleaseAge: 0 }')
    expect((await inspectInstallSecurity(h.workspace)).checks.some(check => check.id === 'install-security-expectation')).toBe(false)
  })

  it.each([null, { minimumReleaseAge: null }, { exceptions: null }, { exceptions: [{ key: 'trustPolicyExclude', package: 'sdk', reason: ' ' }] }])('rejects malformed expectations before defaults can remove them: %j', async (configuration) => {
    const h = await securityFixture()
    await writeFile(path.join(h.workspace, 'repoctl.config.mjs'), `export default ${JSON.stringify({ installationSecurity: configuration })}`)
    await expect(inspectInstallSecurity(h.workspace)).rejects.toThrow(/expectations|exceptions/u)
  })

  it('does not infer defaults for prerelease or unrecognized pnpm versions', async () => {
    const h = await securityFixture()
    for (const pnpmVersion of ['11.0.0-rc.1', '13.0.0', '9.15.5']) {
      const report = await inspectInstallSecurity(h.workspace, { pnpmVersion })
      expect(report.settings.every(setting => setting.state === 'unknown')).toBe(true)
      expect(report.builds.default).toBe('unknown')
      expect(report.checks.find(check => check.id === 'install-security-version')?.status).toBe('warn')
    }
  })

  it('identifies explicit script overrides and incompatible allow-all decisions', async () => {
    const h = await securityFixture('allowBuilds: { esbuild: true }\nignoreScripts: true\n')
    expect((await inspectInstallSecurity(h.workspace)).builds).toMatchObject({ default: 'blocked', override: 'ignore-scripts', decisions: [{ package: 'esbuild', decision: 'allow' }] })
    await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: []\nallowBuilds: { esbuild: false }\ndangerouslyAllowAllBuilds: true\n')
    const report = await inspectInstallSecurity(h.workspace)
    expect(report.builds).toMatchObject({ default: 'unknown', override: 'conflict' })
    expect(report.checks.some(check => check.id === 'install-security-compatibility' && check.status === 'warn')).toBe(true)
  })

  it('keeps global policy scope and legacy configuration formats distinct', async () => {
    const h = await securityFixture()
    await writeFile(path.join(h.home, 'config/pnpm/config.yaml'), 'minimumReleaseAge: 4320\nallowBuilds: { esbuild: true }\n')
    const modern = await inspectInstallSecurity(h.workspace, { pnpmVersion: '12.8.1' })
    expect(modern.settings.find(setting => setting.key === 'minimumReleaseAge')?.value).toBe(4320)
    expect(modern.builds.decisions).toEqual([])
    expect(modern.checks.some(check => check.detail.includes('allowBuilds from global config.yaml'))).toBe(true)
    const legacy = await inspectInstallSecurity(h.workspace, { pnpmVersion: '10.26.0' })
    expect(legacy.settings.find(setting => setting.key === 'minimumReleaseAge')?.value).toBe(0)
  })

  it('applies pnpm minor gates for selector syntax and trust missing-time behavior', async () => {
    const h = await securityFixture('minimumReleaseAgeExclude: ["@acme/*"]\nonlyBuiltDependencies: ["esbuild@0.25.0"]\ntrustPolicy: no-downgrade\n')
    const early = await inspectInstallSecurity(h.workspace, { pnpmVersion: '10.16.0' })
    expect(early.settings.find(setting => setting.key === 'minimumReleaseAgeExclude')?.state).toBe('unsupported')
    expect(early.settings.find(setting => setting.key === 'onlyBuiltDependencies')?.state).toBe('unsupported')
    const later = await inspectInstallSecurity(h.workspace, { pnpmVersion: '10.19.0' })
    expect(later.settings.find(setting => setting.key === 'minimumReleaseAgeExclude')?.state).toBe('active')
    expect(later.settings.find(setting => setting.key === 'onlyBuiltDependencies')?.state).toBe('active')
    await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: []\ntrustPolicy: no-downgrade\nminimumReleaseAge: 1440\n')
    const options = { expectations: { trustPolicy: 'no-downgrade' as const } }
    expect((await inspectInstallSecurity(h.workspace, { ...options, pnpmVersion: '11.22.0' })).checks.filter(check => check.id === 'install-security-expectation')).toHaveLength(0)
    const modern = await inspectInstallSecurity(h.workspace, { ...options, pnpmVersion: '11.23.0' })
    expect(modern.settings.find(setting => setting.key === 'minimumReleaseAgeIgnoreMissingTime')?.value).toBe(true)
    expect(modern.checks.filter(check => check.id === 'install-security-expectation')).toHaveLength(1)
  })

  it('ignores unsupported global directory overrides and rejects ignored parent output modes', async () => {
    const h = await securityFixture()
    const directory = path.join(h.home, 'custom-config')
    await mkdir(directory)
    await writeFile(path.join(directory, 'config.yaml'), 'minimumReleaseAge: 4320\n')
    vi.stubEnv('PNPM_CONFIG_CONFIG_DIR', directory)
    expect((await inspectInstallSecurity(h.workspace)).settings.find(setting => setting.key === 'minimumReleaseAge')?.value).toBe(1440)
    const before = await snapshot(h.root)
    const result = securityCli(h, ['--out', 'unwanted.json'])
    expect(result.status).toBe(1)
    expect(await snapshot(h.root)).toEqual(before)
  })
})
