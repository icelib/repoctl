import { symlink } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { fixture, loadRepo, manifest, snapshot } from './fixture'

it('resolves installed JSON in dependency order without executing entries or mutating files', async () => {
  const repo = await loadRepo()
  const h = await fixture()
  const base = await h.install('@team/base', manifest)
  const app = await h.install('@team/app', { ...manifest, extends: [base] }, '1.0.0', { [base.packageName]: base.version })
  const before = await snapshot(h.root)
  const result = await repo.resolveOrganizationPresets(h.root, [app, base])
  expect(result.layers.map(layer => layer.source.id)).toEqual(['@team/base@1.0.0', '@team/app@1.0.0'])
  expect(result.diagnostics.map(item => [item.id, item.status])).toEqual([['preset.duplicate', 'warn']])
  expect(result.inputs).toHaveLength(5)
  expect(await snapshot(h.root)).toEqual(before)
})

it('reports cycles, conflicting versions, invalid references and incompatible packages', async () => {
  const repo = await loadRepo()
  const h = await fixture()
  const a = { packageName: '@team/a', version: '1.0.0' }
  const b = { packageName: '@team/b', version: '1.0.0' }
  await h.install(a.packageName, { ...manifest, extends: [b] }, a.version, { [b.packageName]: b.version })
  await h.install(b.packageName, { ...manifest, extends: [a] }, b.version, { [a.packageName]: a.version })
  expect((await repo.resolveOrganizationPresets(h.root, [a])).diagnostics).toContainEqual(expect.objectContaining({ id: 'preset.cycle' }))
  expect((await repo.resolveOrganizationPresets(h.root, [{ ...a, version: '^1.0.0' }])).diagnostics[0]?.id).toBe('preset.invalid-reference')
  await h.install(a.packageName, manifest)
  expect((await repo.resolveOrganizationPresets(h.root, [a, { ...a, version: '2.0.0' }])).diagnostics[0]?.id).toBe('preset.conflicting-version')
  await h.install(a.packageName, { ...manifest, requires: { repoctl: '>=999' } })
  expect((await repo.resolveOrganizationPresets(h.root, [a])).diagnostics[0]?.id).toBe('preset.incompatible')
  await h.install(a.packageName, { ...manifest, config: { commands: { clean: { misspelled: true } } } })
  expect((await repo.resolveOrganizationPresets(h.root, [a])).diagnostics[0]).toMatchObject({ id: 'preset.invalid-manifest', detail: expect.stringContaining('config.unknown-field') })
})

it('requires exact declarations and matching installed metadata and rejects linked manifests', async () => {
  const repo = await loadRepo()
  const h = await fixture()
  const ref = await h.install('@team/base')
  await h.json('package.json', { name: 'consumer', devDependencies: { '@team/base': '^1.0.0' } })
  expect((await repo.resolveOrganizationPresets(h.root, [ref])).diagnostics[0]?.id).toBe('preset.invalid-reference')
  await h.install(ref.packageName)
  await h.json('node_modules/@team/base/package.json', { name: '@team/base', version: '2.0.0' })
  expect((await repo.resolveOrganizationPresets(h.root, [ref])).diagnostics[0]?.id).toBe('preset.version-mismatch')
  await h.install(ref.packageName)
  await h.json('external.json', manifest)
  const { rm } = await import('node:fs/promises')
  await rm(path.join(h.root, 'node_modules/@team/base/repoctl.preset.json'))
  await symlink(path.join(h.root, 'external.json'), path.join(h.root, 'node_modules/@team/base/repoctl.preset.json'))
  expect((await repo.resolveOrganizationPresets(h.root, [ref])).diagnostics[0]?.id).toBe('preset.invalid-manifest')
})

it('forbids business paths, traversal, unsafe Windows names and unregistered capabilities', async () => {
  const repo = await loadRepo()
  const h = await fixture()
  for (const target of ['packages/app/index.ts', 'package.json', '../escape', '.repoctl/state.json', 'scripts/CON.ts', 'scripts/node_modules/run.js']) {
    const ref = await h.install('@team/base', { ...manifest, assets: [{ source: 'a', target }] })
    expect((await repo.resolveOrganizationPresets(h.root, [ref])).diagnostics[0]?.id, target).toBe('preset.invalid-manifest')
  }
  const ref = await h.install('@team/base', { ...manifest, capabilities: [{ id: 'run-package-script' }] })
  expect((await repo.resolveOrganizationPresets(h.root, [ref])).diagnostics[0]?.id).toBe('preset.invalid-manifest')
})
