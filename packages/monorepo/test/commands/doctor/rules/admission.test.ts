import { getDoctorRuleIds, runDoctor } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import fs from '@/utils/fs'
import { cli, fixture } from './fixture'

const admissionIds = ['admission-denied', 'admission-not-allowed', 'admission-conflict', 'admission-resolution', 'admission-unused-exception', 'admission-expired-exception', 'admission-expiring-exception', 'admission-selector-unmatched', 'admission-exceptions', 'admission-policy', 'admission-config']

it('registers admission IDs, filters detailed findings and preserves the failing aggregate', async () => {
  const h = await fixture()
  await fs.outputJson(path.join(h.root, 'packages/app/package.json'), { name: 'app', private: true, dependencies: { 'legacy-sdk': '^1' } })
  await fs.outputFile(path.join(h.root, 'repoctl.config.mjs'), 'export default { dependencyPolicy: { rules: [{ id: "my-browser-policy", workspaces: ["app"], dependencies: ["legacy-sdk"], effect: "deny", sections: ["dependencies"], reason: "Use a browser-safe dependency" }] } }')
  expect(getDoctorRuleIds()).toEqual(expect.arrayContaining(admissionIds))
  expect(getDoctorRuleIds()).not.toContain('my-browser-policy')
  const selected = await runDoctor(h.cwd, { rules: ['admission-denied'] })
  expect(selected.checks).toMatchObject([{ id: 'admission-denied', status: 'fail', path: 'packages/app/package.json', field: 'dependencies.legacy-sdk' }])
  expect(selected.checks).toHaveLength(1)
  const aggregate = await runDoctor(h.cwd, { rules: ['admission-policy'] })
  expect(aggregate.checks).toMatchObject([{ id: 'admission-policy', status: 'fail' }])
  expect(aggregate.checks).toHaveLength(1)
  const output = cli(h.cwd, ['--rules', 'admission-denied', '--json', '--strict'])
  expect(output.status, output.stderr).toBe(1)
  expect(JSON.parse(output.stdout).checks.map((check: { id: string }) => check.id)).toEqual(['admission-denied'])
  const suppressed = await runDoctor(h.cwd, { rules: ['admission-denied'], suppressions: [{ id: 'admission-denied', path: 'packages/app/package.json', reason: 'Tracked in the migration plan' }] })
  expect(suppressed.summary.fail).toBe(0)
  expect(suppressed.rawSummary?.fail).toBe(1)
})

it('skips unselected admission configuration and retains prerequisite failures for selected admission rules', async () => {
  const h = await fixture({ packageManager: 'pnpm@12.8.1' })
  await fs.outputFile(path.join(h.root, 'repoctl.config.mjs'), 'export default { dependencyPolicy: null }')
  expect((await runDoctor(h.cwd, { rules: ['package-manager'] })).checks.map(item => item.id)).toEqual(['package-manager'])
  expect((await runDoctor(h.cwd, { rules: ['admission-denied'] })).checks).toMatchObject([{ id: 'admission-config', status: 'fail' }])
  await fs.outputFile(path.join(h.root, 'repoctl.config.mjs'), 'export default {}')
  expect((await runDoctor(h.cwd, { rules: admissionIds })).checks).toEqual([])
})
