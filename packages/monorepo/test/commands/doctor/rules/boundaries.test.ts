import { getDoctorRuleIds, runDoctor } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import fs from '@/utils/fs'
import { cli, fixture } from './fixture'

const boundaryIds = ['boundary-rule', 'boundary-cycle', 'boundary-config', 'boundary-selector-unmatched', 'boundary-graph', 'boundary-exception-unused', 'boundary-exceptions', 'boundary-policy']

it('registers stable boundary IDs and filters findings without exposing custom rule names as IDs', async () => {
  const h = await fixture()
  await fs.outputJson(path.join(h.root, 'packages/app/package.json'), { name: 'app', private: true, dependencies: { shared: 'workspace:*' } })
  await fs.outputJson(path.join(h.root, 'packages/shared/package.json'), { name: 'shared', private: true, dependencies: { app: 'workspace:*' } })
  await fs.outputFile(path.join(h.root, 'repoctl.config.mjs'), 'export default { boundaries: { rules: [{ id: "my-architecture-rule", from: { packages: ["app"] }, allow: [] }] } }')
  expect(getDoctorRuleIds()).toEqual(expect.arrayContaining(boundaryIds))
  expect(getDoctorRuleIds()).not.toContain('my-architecture-rule')
  expect((await runDoctor(h.cwd, { rules: ['package-json'] })).checks).toEqual([expect.objectContaining({ id: 'package-json', status: 'pass' })])
  const selected = await runDoctor(h.cwd, { rules: ['boundary-rule'] })
  expect(selected.checks).toHaveLength(1)
  expect(selected.checks[0]).toMatchObject({ id: 'boundary-rule', status: 'fail' })
  const cycles = await runDoctor(h.cwd, { rules: ['boundary-cycle'] })
  expect(cycles.checks.map(check => check.id)).toEqual(['boundary-cycle'])
  const summary = await runDoctor(h.cwd, { rules: ['boundary-policy'] })
  expect(summary.checks).toMatchObject([{ id: 'boundary-policy', status: 'fail' }])
  const output = cli(h.cwd, ['--rules', 'boundary-rule', '--json', '--strict'])
  expect(output.status, output.stderr).toBe(1)
  expect(JSON.parse(output.stdout).checks.map((check: { id: string }) => check.id)).toEqual(['boundary-rule'])
})

it('validates global configuration and retains selected boundary prerequisite failures', async () => {
  const h = await fixture({ packageManager: 'pnpm@12.8.1' })
  await fs.outputFile(path.join(h.root, 'repoctl.config.mjs'), 'export default { boundaries: null }')
  await expect(runDoctor(h.cwd, { rules: ['package-manager'] })).rejects.toMatchObject({ code: 'REPOCTL_CONFIG_INVALID', diagnostics: [expect.objectContaining({ path: 'boundaries' })] })
  await fs.outputFile(path.join(h.root, 'repoctl.config.mjs'), 'export default { boundaries: { rules: [{ id: "rule", from: {}, allow: [] }] } }')
  const unrelated = await runDoctor(h.cwd, { rules: ['package-manager'] })
  expect(unrelated.checks.map(check => check.id)).toEqual(['package-manager'])
  const selected = await runDoctor(h.cwd, { rules: ['boundary-rule'] })
  expect(selected.checks).toMatchObject([{ id: 'boundary-config', status: 'fail' }])
  await fs.outputFile(path.join(h.root, 'repoctl.config.mjs'), 'export default {}')
  expect((await runDoctor(h.cwd, { rules: boundaryIds })).checks).toEqual([])
})
