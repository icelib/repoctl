import { expect, it } from 'vitest'
import { cli, fixture, loadRepo, manifest, snapshot } from './fixture'

it('merges preset objects and replaces arrays before project and CLI overrides with precise sources', async () => {
  const repo = await loadRepo()
  const h = await fixture()
  const base = await h.install('@team/base', { ...manifest, config: { commands: { clean: { includePrivate: false, ignorePackages: ['base'] }, release: { hooks: { beforeVersion: ['base'] } } } }, capabilities: [{ id: 'playwright', reason: 'Parent recommendation' }] })
  const app = await h.install('@team/app', { ...manifest, extends: [base], config: { commands: { clean: { ignorePackages: ['app'], dryRun: true } } }, capabilities: [{ id: 'playwright', reason: 'Browser checks' }] }, '1.0.0', { [base.packageName]: base.version })
  await h.config({ presets: [app], commands: { clean: { ignorePackages: [], autoConfirm: false } } })
  const before = await snapshot(h.root)
  const report = await repo.explainMonorepoConfig(h.root, { command: 'clean', overrides: { dryRun: false } })
  expect(report.effective?.values).toMatchObject({ includePrivate: false, ignorePackages: [], autoConfirm: false, dryRun: false })
  expect(report.effective?.sources).toMatchObject({ includePrivate: { kind: 'preset', packageName: '@team/base', version: '1.0.0' }, ignorePackages: { kind: 'project' }, dryRun: { kind: 'cli' } })
  expect(report.effective?.origins['includePrivate']).toBe('project')
  expect(report.layers?.map(layer => layer.source.kind)).toEqual(['preset', 'preset', 'project'])
  const inspection = await repo.inspectMonorepoConfig(h.root)
  expect(inspection.capabilities).toEqual([expect.objectContaining({ id: 'playwright', reason: 'Browser checks', source: expect.objectContaining({ packageName: '@team/app' }) })])
  expect(await snapshot(h.root)).toEqual(before)
})

it('isolates project overrides between consumers and redacts preset payloads in every report layer', async () => {
  const repo = await loadRepo()
  const a = await fixture()
  const b = await fixture()
  const preset = { ...manifest, config: { commands: { ai: { baseDir: 'organization', force: true }, mirror: { env: { CREDENTIAL: 'private-preset-value' } } } } }
  const first = await a.install('@team/base', preset)
  const second = await b.install('@team/base', preset)
  await a.config({ presets: [first], commands: { ai: { force: false } } })
  await b.config({ presets: [second] })
  expect((await repo.loadMonorepoConfigDetails(a.root, { refresh: true })).config.commands?.ai?.force).toBe(false)
  expect((await repo.loadMonorepoConfigDetails(b.root, { refresh: true })).config.commands?.ai?.force).toBe(true)
  for (const args of [[], ['--command', 'mirror']]) {
    const result = await cli(a.root, ['config', 'inspect', '--json', ...args])
    expect(result.exitCode, result.stderr).toBe(0)
    expect(result.stdout + result.stderr).not.toContain('private-preset-value')
    expect(result.stdout).toContain('[redacted]')
  }
})

it('gives CLI inspection the same values and origins and blocks invalid presets before command writes', async () => {
  const h = await fixture()
  const ref = await h.install('@team/base', { ...manifest, config: { commands: { ai: { baseDir: 'organization', force: true } } } })
  await h.config({ presets: [ref] })
  const result = await cli(h.root, ['config', 'inspect', '--command', 'ai', '--set', 'force=false', '--json'])
  expect(result.exitCode, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout).effective).toMatchObject({ values: { baseDir: 'organization', force: false }, sources: { baseDir: { packageName: '@team/base' }, force: { kind: 'cli' } } })
  await h.install('@team/base', { ...manifest, requires: { repoctl: '>=999' } })
  const before = await snapshot(h.root)
  const blocked = await cli(h.root, ['ai', 'prompt', 'create', '--name', 'should-not-exist'])
  expect(blocked.exitCode).toBe(1)
  expect(blocked.stderr).toContain('preset.incompatible')
  expect(await snapshot(h.root)).toEqual(before)
})
