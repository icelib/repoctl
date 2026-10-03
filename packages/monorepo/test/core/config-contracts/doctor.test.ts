import { realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { explainMonorepoConfig, resolveCommandValues, runDoctor, validateConfigFile, validateMonorepoConfig } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { fixture as doctorFixture } from '../../commands/doctor/rules/fixture'
import { fixture, invoke } from './fixtures'

it('preserves all-rule defaults and explicit empty doctor selection in inspection and execution', async () => {
  const h = await doctorFixture()
  expect(resolveCommandValues('doctor')).toMatchObject({ values: {}, origins: {} })
  const defaults = await explainMonorepoConfig(h.cwd, { command: 'doctor' })
  expect(defaults).toMatchObject({ valid: true, effective: { command: 'doctor', values: {}, origins: {} } })
  expect((await runDoctor(h.cwd)).checks).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'package-json' })]))

  await writeFile(path.join(h.root, 'repoctl.config.mjs'), 'export default { commands: { doctor: { rules: [], suppressions: [] } } }')
  expect(await validateConfigFile(h.root)).toMatchObject({ valid: true, diagnostics: [] })
  expect(await explainMonorepoConfig(h.cwd, { command: 'doctor' })).toMatchObject({
    effective: { values: { rules: [], suppressions: [] }, origins: { rules: 'project', suppressions: 'project' } },
  })
  expect((await runDoctor(h.cwd)).checks).toEqual([])
  const result = invoke(h.cwd, ['doctor', '--json', '--strict'])
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ checks: [], summary: { pass: 0, warn: 0, fail: 0 } })
})

it('explains root doctor policy from a package directory and preserves CLI override precedence', async () => {
  const h = await doctorFixture()
  const doctor = { rules: ['root-scripts'], suppressions: [{ id: 'root-scripts', reason: 'Reviewed migration', expires: '2099-12-31' }] }
  await writeFile(path.join(h.root, 'repoctl.config.mjs'), `export default ${JSON.stringify({ commands: { doctor } })}`)
  await writeFile(path.join(h.cwd, 'repoctl.config.mjs'), 'export default { commands: { doctor: { rules: ["package-json"] } } }')
  const explanation = await explainMonorepoConfig(h.cwd, { command: 'doctor' })
  expect(explanation).toMatchObject({ valid: true, file: await realpath(path.join(h.root, 'repoctl.config.mjs')), effective: { values: doctor, origins: { rules: 'project', suppressions: 'project' } } })
  const inspected = invoke(h.cwd, ['config', 'inspect', '--command', 'doctor', '--json'])
  expect(inspected.status, inspected.stderr).toBe(0)
  expect(JSON.parse(inspected.stdout).effective).toEqual(explanation.effective)
  const checked = invoke(h.cwd, ['doctor', '--json', '--strict'])
  expect(checked.status, checked.stderr).toBe(0)
  expect(JSON.parse(checked.stdout)).toMatchObject({ checks: [{ id: 'root-scripts', status: 'warn', suppression: { reason: 'Reviewed migration' } }], summary: { warn: 0 } })

  expect(resolveCommandValues('doctor', doctor, { rules: [] })).toMatchObject({
    values: { rules: [], suppressions: doctor.suppressions },
    origins: { rules: 'cli', suppressions: 'project' },
  })
  const overridden = invoke(h.cwd, ['config', 'inspect', '--command', 'doctor', '--set', 'rules=[]', '--json'])
  expect(overridden.status, overridden.stderr).toBe(0)
  expect(JSON.parse(overridden.stdout).effective).toMatchObject({ values: { rules: [] }, origins: { rules: 'cli' } })
  const selected = invoke(h.cwd, ['doctor', '--rules', 'package-json', '--json'])
  expect(selected.status, selected.stderr).toBe(0)
  expect(JSON.parse(selected.stdout).checks).toEqual([expect.objectContaining({ id: 'package-json', status: 'pass' })])
})

it.each([
  [null, 'commands.doctor'],
  [{ rules: 'root-scripts' }, 'commands.doctor.rules'],
  [{ rules: [null] }, 'commands.doctor.rules[0]'],
  [{ suppressions: [{ id: 'root-scripts' }] }, 'commands.doctor.suppressions[0].reason'],
  [{ suppressions: [{ id: 'root-scripts', reason: 'Reviewed', expires: 20261231 }] }, 'commands.doctor.suppressions[0].expires'],
  [{ suppressions: [{ id: 'root-scripts', reason: 'Reviewed', path: false }] }, 'commands.doctor.suppressions[0].path'],
  [{ suppressions: [{ id: 'root-scripts', reason: 'Reviewed', typo: 'private-value' }] }, 'commands.doctor.suppressions[0].typo'],
  [{ typo: 'private-value' }, 'commands.doctor.typo'],
])('validates doctor field structure without exposing raw values', (doctor, expectedPath) => {
  const diagnostics = validateMonorepoConfig({ commands: { doctor } })
  expect(diagnostics.map(item => item.path)).toContain(expectedPath)
  expect(JSON.stringify(diagnostics)).not.toContain('private-value')
})

it('rejects the full invalid configuration before an explicitly selected doctor rule', async () => {
  const cwd = await fixture('export default { commands: { doctor: { typo: "private-value" } } }')
  const result = invoke(cwd, ['doctor', '--rules', 'package-json', '--json'])
  expect(result.status).toBe(1)
  expect(JSON.parse(result.stderr)).toMatchObject({ valid: false, diagnostics: [{ id: 'config.unknown-field', path: 'commands.doctor.typo' }] })
  expect(result.stdout + result.stderr).not.toContain('private-value')
})
