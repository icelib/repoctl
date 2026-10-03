import { expect, it } from 'vitest'
import { cli, fixture, loadRepo, manifest, snapshot } from './fixture'

it('discovers fixed organization templates without fetching or executing the preset package', async () => {
  const repo = await loadRepo()
  const h = await fixture()
  const ref = await h.install('@team/base', { ...manifest, templates: { 'team.sdk': { source: 'templates/sdk', target: 'packages/sdk', label: 'Team SDK', category: 'library' } } })
  await h.config({ presets: [ref] })
  const before = await snapshot(h.root)
  const catalog = await repo.resolveTemplateCatalog({ cwd: h.root })
  const template = catalog.entries.find(entry => entry.key === 'team.sdk')
  expect(template).toMatchObject({ origin: 'custom', overridesBuiltin: false, preset: ref, remote: { kind: 'npm', ...ref }, configFile: expect.stringContaining('repoctl.preset.json'), configPath: 'templates.team\\.sdk' })
  const result = await cli(h.root, ['templates', 'team.sdk', '--json'])
  expect(result.exitCode, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ preset: ref, remote: { kind: 'npm', ...ref } })
  expect(await snapshot(h.root)).toEqual(before)
})

it('uses later preset declarations, then project definitions without leaking replaced source identity', async () => {
  const repo = await loadRepo()
  const h = await fixture()
  const base = await h.install('@team/base', { ...manifest, templates: { team: { source: 'templates/base', target: 'packages/base' } } })
  const app = await h.install('@team/app', { ...manifest, extends: [base], templates: { team: { source: 'templates/app', target: 'packages/app' } } }, '1.0.0', { [base.packageName]: base.version })
  await h.config({ presets: [app] })
  const first = await repo.resolveTemplateCatalog({ cwd: h.root })
  expect(first.entries.find(entry => entry.key === 'team')).toMatchObject({ preset: app, remote: { kind: 'npm', ...app }, overridesBuiltin: false })
  await h.config({ presets: [app], commands: { create: { templateMap: { team: { source: 'local', target: 'packages/local' } } } } })
  await repo.loadMonorepoConfigDetails(h.root, { refresh: true })
  const second = await repo.resolveTemplateCatalog({ cwd: h.root })
  const local = second.entries.find(entry => entry.key === 'team')
  expect(local).toMatchObject({ source: 'local', target: 'packages/local', overridesBuiltin: false })
  expect(local?.remote).toBeUndefined()
  expect(local?.preset).toBeUndefined()
})

it('rejects presets that try to replace the fixed declaring package with another template source', async () => {
  const repo = await loadRepo()
  const h = await fixture()
  const ref = await h.install('@team/base', { ...manifest, templates: { team: { source: 'templates/sdk', target: 'packages/sdk', remote: { kind: 'npm', packageName: '@other/package', version: '1.0.0' } } } })
  const resolution = await repo.resolveOrganizationPresets(h.root, [ref])
  expect(resolution.diagnostics[0]?.id).toBe('preset.invalid-manifest')
})
