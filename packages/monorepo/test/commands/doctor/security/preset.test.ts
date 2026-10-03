import { link, readFile, rename, symlink, writeFile } from 'node:fs/promises'
import { applyInstallSecurityPreset, inspectInstallSecurity, planInstallSecurityPreset } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it, vi } from 'vitest'
import { securityCli, securityFixture, snapshot } from './fixture'

describe('reviewed additive installation policy presets', () => {
  it('previews without writes and preserves explicit zero, approvals, exceptions, comments and unrelated credentials', async () => {
    const original = 'minimumReleaseAge: 0\n# keep this comment\nminimumReleaseAgeExclude: [internal-sdk]\nallowBuilds: { esbuild: true, legacy: false }\nregistry: "https://alice:token@example.invalid"\n'
    const h = await securityFixture(original)
    const before = await snapshot(h.root)
    const plan = await planInstallSecurityPreset(h.workspace)
    expect(plan.additions).not.toHaveProperty('minimumReleaseAge')
    expect(plan.additions).not.toHaveProperty('allowBuilds')
    expect(plan.preserved).toContain('minimumReleaseAge')
    expect(JSON.stringify(plan)).not.toMatch(/alice|token|example\.invalid/u)
    expect(await snapshot(h.root)).toEqual(before)
    expect((await applyInstallSecurityPreset(h.workspace, plan)).status).toBe('applied')
    expect(await readFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'utf8')).toContain(original)
    const after = await snapshot(h.root)
    expect((await applyInstallSecurityPreset(h.workspace, plan)).status).toBe('unchanged')
    expect(await snapshot(h.root)).toEqual(after)
    expect((await inspectInstallSecurity(h.workspace, { pnpmVersion: '12.8.1' })).settings.find(item => item.key === 'minimumReleaseAge')?.value).toBe(0)
  })

  it('preserves explicit allow-all without adding a conflicting map and disables the missing-time bypass when absent', async () => {
    const h = await securityFixture('dangerouslyAllowAllBuilds: true\n')
    const plan = await planInstallSecurityPreset(h.workspace)
    expect(plan.additions).not.toHaveProperty('allowBuilds')
    expect(plan.additions.minimumReleaseAgeIgnoreMissingTime).toBe(false)
    expect(plan.preserved).toContain('dangerouslyAllowAllBuilds')
  })

  it('preserves a global or environment policy instead of shadowing it in the workspace', async () => {
    const h = await securityFixture()
    await writeFile(path.join(h.home, 'config/pnpm/config.yaml'), 'minimumReleaseAge: 4320\n')
    vi.stubEnv('PNPM_CONFIG_TRUST_POLICY', 'off')
    const plan = await planInstallSecurityPreset(h.workspace)
    expect(plan.preserved).toEqual(['minimumReleaseAge', 'trustPolicy'])
    expect(plan.additions).not.toHaveProperty('minimumReleaseAge')
    expect(plan.additions).not.toHaveProperty('trustPolicy')
  })

  it('rejects changed inputs and tampered additions before changing the file', async () => {
    const h = await securityFixture()
    const plan = await planInstallSecurityPreset(h.workspace)
    const mutated = structuredClone(plan)
    mutated.additions.minimumReleaseAge = 0
    await expect(applyInstallSecurityPreset(h.workspace, mutated)).rejects.toThrow('Invalid')
    await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: []\n# concurrent edit\n')
    const before = await snapshot(h.root)
    await expect(applyInstallSecurityPreset(h.workspace, plan)).rejects.toThrow('inputs changed')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('applies only an explicitly reviewed CLI plan and returns stable JSON', async () => {
    const h = await securityFixture()
    const before = await snapshot(h.root)
    const preview = securityCli(h, ['--preset', 'balanced', '--json'])
    expect(preview.status, preview.stderr).toBe(0)
    expect(await snapshot(h.root)).toEqual(before)
    const file = path.join(h.workspace, 'security-plan.json')
    await writeFile(file, preview.stdout)
    const applied = securityCli(h, ['--apply', file, '--json'])
    expect(applied.status, applied.stderr).toBe(0)
    expect(JSON.parse(applied.stdout)).toEqual({ status: 'applied', changed: ['pnpm-workspace.yaml'] })
    expect(JSON.parse(securityCli(h, ['--apply', file]).stdout).status).toBe('unchanged')
  })

  it('detects changed values of an already-preserved external policy', async () => {
    const h = await securityFixture()
    const file = path.join(h.home, 'config/pnpm/config.yaml')
    await writeFile(file, 'minimumReleaseAge: 4320\n')
    const plan = await planInstallSecurityPreset(h.workspace)
    await writeFile(file, 'minimumReleaseAge: 60\n')
    const before = await snapshot(h.root)
    await expect(applyInstallSecurityPreset(h.workspace, plan)).rejects.toThrow('inputs changed')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('rejects newly introduced external policy after preview', async () => {
    const h = await securityFixture()
    const plan = await planInstallSecurityPreset(h.workspace)
    vi.stubEnv('PNPM_CONFIG_MINIMUM_RELEASE_AGE', '4320')
    const before = await snapshot(h.root)
    await expect(applyInstallSecurityPreset(h.workspace, plan)).rejects.toThrow('inputs changed')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it.each(['symlink', 'hardlink'])('refuses %s policy input without modifying its source', async (kind) => {
    const h = await securityFixture()
    const original = path.join(h.workspace, 'pnpm-workspace.yaml')
    const target = path.join(h.workspace, 'actual-workspace.yaml')
    await rename(original, target)
    if (kind === 'symlink') {
      await symlink(target, original)
    }
    else {
      await link(target, original)
    }
    const before = await snapshot(h.root)
    await expect(planInstallSecurityPreset(h.workspace)).rejects.toThrow(/Linked|Unsafe/u)
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('does not mix the new map with legacy build lists or add unsupported settings', async () => {
    const h = await securityFixture('onlyBuiltDependencies: [esbuild]\n', '10.26.0')
    const plan = await planInstallSecurityPreset(h.workspace, { pnpmVersion: '10.26.0' })
    expect(plan.additions).not.toHaveProperty('allowBuilds')
    expect(plan.additions).not.toHaveProperty('minimumReleaseAgeStrict')
    await expect(planInstallSecurityPreset(h.workspace, { pnpmVersion: '13.0.0' })).rejects.toThrow('supported pnpm version')
  })
})
