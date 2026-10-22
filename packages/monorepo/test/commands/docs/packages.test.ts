import { planDocsDeployment } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { cleanup, commit, fixture, makeRecord, put } from './helpers'

afterEach(cleanup)

it.each([
  ['dependencies', 'workspace:runtime@*', ''],
  ['optionalDependencies', 'workspace:../runtime', ''],
  ['peerDependencies', 'file:../runtime', ''],
  ['dependencies', 'link:../runtime', ''],
  ['dependencies', 'npm:runtime@^1.0.0', ''],
  ['dependencies', 'catalog:', 'catalog:\n  alias: npm:runtime@^1.0.0\n'],
  ['dependencies', 'catalog:runtime', 'catalogs:\n  runtime:\n    alias: workspace:runtime@*\n'],
  ['dependencies', 'catalog:runtime', 'catalogs:\n  runtime:\n    alias: file:../runtime\n'],
])('checks frozen %s runtime dependency %s', async (field, specifier, catalog) => {
  const { cwd, sha, store, options } = await fixture()
  await put(cwd, 'packages/core/package.json', JSON.stringify({ name: 'core', version: '1.0.0', [field]: { alias: specifier } }))
  await put(cwd, 'pnpm-workspace.yaml', `packages:\n  - packages/*\n${catalog}`)
  await put(cwd, 'packages/runtime/src/index.ts', 'export const unreleased = true\n')
  const sourceSha = commit(cwd)
  const record = makeRecord(sourceSha, { packages: [{ name: 'core', version: '1.0.0', sourceSha }, { name: 'runtime', version: '1.0.0', sourceSha: sha }], releasedPackages: ['core'] })
  await store.github.writeAutomationState(`releases/${record.id}`, record)
  // Current main no longer has this dependency; the release snapshot still does.
  await put(cwd, 'packages/core/package.json', JSON.stringify({ name: 'core', version: '1.0.0' }))
  await put(cwd, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
  commit(cwd)
  const plan = await planDocsDeployment({ ...options, release: record.id })
  expect(plan.packages.map(pkg => pkg.name)).toEqual(['core', 'runtime'])
  expect(plan.eligible).toBe(false)
  expect(plan.blockers).toContain('Unpublished inputs for runtime: packages/runtime/src/index.ts')
})

it('recognizes an aliased runtime-only release and follows its transitive runtime dependencies', async () => {
  const { cwd, options, store } = await fixture()
  await put(cwd, 'packages/core/package.json', JSON.stringify({ name: 'core', version: '1.0.0', dependencies: { alias: 'workspace:runtime@*' }, devDependencies: { missing: 'workspace:*' } }))
  await put(cwd, 'packages/runtime/package.json', JSON.stringify({ name: 'runtime', version: '1.0.0', peerDependencies: { support: '^9.0.0' } }))
  await put(cwd, 'packages/support/package.json', JSON.stringify({ name: 'support', version: '1.0.0' }))
  const sourceSha = commit(cwd)
  const record = makeRecord(sourceSha, { packages: [...makeRecord(sourceSha).packages, { name: 'support', version: '1.0.0', sourceSha }], releasedPackages: ['support'] })
  await store.github.writeAutomationState(`releases/${record.id}`, record)
  const plan = await planDocsDeployment({ ...options, release: record.id })
  expect(plan).toMatchObject({ eligible: true, skipped: false, blockers: [] })
  expect(plan.packages.map(pkg => pkg.name)).toEqual(['core', 'runtime', 'support'])
})

it.each(['workspace:missing@*', 'workspace:../missing', 'file:../missing', 'link:../missing', 'catalog:missing'])('fails closed for unresolved explicit dependency %s', async (specifier) => {
  const { cwd, options, store } = await fixture()
  await put(cwd, 'packages/core/package.json', JSON.stringify({ name: 'core', version: '1.0.0', dependencies: { alias: specifier } }))
  const sourceSha = commit(cwd)
  const record = makeRecord(sourceSha)
  await store.github.writeAutomationState(`releases/${record.id}`, record)
  await expect(planDocsDeployment({ ...options, release: record.id })).rejects.toThrow(/(?:Unresolved local|Cannot resolve).*runtime.*dependency/)
})

it('rejects ambiguous workspace names instead of choosing a publication proof arbitrarily', async () => {
  const { cwd, options, store } = await fixture()
  await put(cwd, 'packages/duplicate/package.json', JSON.stringify({ name: 'runtime', version: '1.0.0' }))
  const sourceSha = commit(cwd)
  const record = makeRecord(sourceSha)
  await store.github.writeAutomationState(`releases/${record.id}`, record)
  await expect(planDocsDeployment({ ...options, release: record.id })).rejects.toThrow('Duplicate documentation workspace package name: runtime')
})
