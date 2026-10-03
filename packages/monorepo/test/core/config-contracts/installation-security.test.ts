import { loadMonorepoConfigDetails, runDoctor, validateConfigFile, validateMonorepoConfig } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { fixture, invoke } from './fixtures'

it('loads and validates all installation security expectation fields through the built config contract', async () => {
  const installationSecurity = {
    minimumReleaseAge: 0,
    trustPolicy: 'no-downgrade',
    requireBuildApproval: false,
    severity: 'fail',
    exceptions: [{ key: 'minimumReleaseAgeExclude', package: '@team/tool@1.2.3', reason: 'Reviewed release' }],
  }
  const cwd = await fixture(`export default ${JSON.stringify({ installationSecurity })}`)
  expect(await validateConfigFile(cwd)).toMatchObject({ valid: true, diagnostics: [] })
  expect((await loadMonorepoConfigDetails(cwd)).config.installationSecurity).toEqual(installationSecurity)
  const result = invoke(cwd, ['config', 'validate', '--json'])
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ valid: true })
  expect(validateMonorepoConfig({ installationSecurity: { minimumReleaseAge: 0.5 } })).toEqual([])
})

it.each([
  [{ minimumReleaseAge: -1 }, 'installationSecurity.minimumReleaseAge'],
  [{ minimumReleaseAge: Number.POSITIVE_INFINITY }, 'installationSecurity.minimumReleaseAge'],
  [{ trustPolicy: 'off' }, 'installationSecurity.trustPolicy'],
  [{ requireBuildApproval: 'private-value' }, 'installationSecurity.requireBuildApproval'],
  [{ severity: 'error' }, 'installationSecurity.severity'],
  [{ exceptions: [{ key: 'trustPolicyExclude', package: 'tool' }] }, 'installationSecurity.exceptions[0].reason'],
  [{ exceptions: [{ key: 'trustPolicyExclude', package: 'tool', reason: 'Reviewed', typo: 'private-value' }] }, 'installationSecurity.exceptions[0].typo'],
  [{ unknown: 'private-value' }, 'installationSecurity.unknown'],
])('rejects malformed security fields without exposing policy values', (installationSecurity, expectedPath) => {
  const diagnostics = validateMonorepoConfig({ installationSecurity })
  expect(diagnostics.map(item => item.path)).toContain(expectedPath)
  expect(JSON.stringify(diagnostics)).not.toContain('private-value')
})

it('rejects invalid root policy before doctor starts even with a workspace-only selection', async () => {
  const cwd = await fixture('export default { installationSecurity: {unknown: "private-value"} }')
  await expect(runDoctor(cwd, { rules: ['package-json'] })).rejects.toThrow('installationSecurity.unknown')
})

it('rejects invalid root policy in CLI preflight before doctor starts', async () => {
  const cwd = await fixture('export default { installationSecurity: {unknown: "private-value"} }')
  const result = invoke(cwd, ['doctor', '--json'])
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('installationSecurity.unknown')
  expect(result.stdout + result.stderr).not.toContain('private-value')
})
