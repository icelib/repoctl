import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { cli, fixture, loadRepo, manifest, snapshot } from './fixture'

const assets = [{ source: 'assets/check.ts', target: 'scripts/team-check.ts' }]
const base = 'export const first = 1\nexport const second = 2\nexport const third = 3\nexport const fourth = 4\n'

async function prepared(version = '1.0.0') {
  const h = await fixture()
  const ref = await h.install('@team/base', { ...manifest, assets }, version)
  await h.write('node_modules/@team/base/assets/check.ts', base)
  await h.config({ presets: [ref] })
  return h
}

it('plans without writes, applies exact reviewed bytes and ownership, and replays idempotently', async () => {
  const repo = await loadRepo()
  const h = await prepared()
  const before = await snapshot(h.root)
  const plan = await repo.planOrganizationPresetAssets(h.root)
  expect(plan).toMatchObject({ status: 'ready', files: [{ path: assets[0]!.target, status: 'add', source: { packageName: '@team/base', version: '1.0.0' } }] })
  expect(await snapshot(h.root)).toEqual(before)
  await expect(repo.applyOrganizationPresetAssets(plan)).resolves.toMatchObject({ status: 'applied' })
  expect(await h.read(assets[0]!.target)).toBe(base)
  const applied = await snapshot(h.root)
  await expect(repo.applyOrganizationPresetAssets(plan)).resolves.toMatchObject({ status: 'unchanged' })
  expect(await snapshot(h.root)).toEqual(applied)
  expect((await repo.planOrganizationPresetAssets(h.root)).status).toBe('unchanged')
})

it('merges a fixed package upgrade with local changes and records the new upstream baseline', async () => {
  const repo = await loadRepo()
  const h = await prepared()
  await repo.applyOrganizationPresetAssets(await repo.planOrganizationPresetAssets(h.root))
  await h.write(assets[0]!.target, base.replace('fourth = 4', 'fourth = 40'))
  const ref = await h.install('@team/base', { ...manifest, assets }, '1.1.0')
  await h.config({ presets: [ref] })
  await h.write('node_modules/@team/base/assets/check.ts', base.replace('first = 1', 'first = 10'))
  const plan = await repo.planOrganizationPresetAssets(h.root)
  expect(plan.files[0]).toMatchObject({ status: 'modify', reason: 'three-way-merge' })
  expect(plan.files[0]?.diff).toContain('+export const first = 10')
  await repo.applyOrganizationPresetAssets(plan)
  expect(await h.read(assets[0]!.target)).toBe(base.replace('first = 1', 'first = 10').replace('fourth = 4', 'fourth = 40'))
  const baseline = JSON.parse(await h.read(plan.files[0]!.baseline!.path))
  expect(baseline.source).toMatchObject({ packageName: '@team/base', version: '1.1.0' })
  expect(Buffer.from(baseline.upstream.content, 'base64').toString()).not.toContain('fourth = 40')
  expect((await repo.planOrganizationPresetAssets(h.root)).status).toBe('unchanged')
})

it('preserves overlapping edits and local deletions, and never adopts existing or other-owned files', async () => {
  const repo = await loadRepo()
  const h = await prepared()
  await h.write(assets[0]!.target, base)
  expect((await repo.planOrganizationPresetAssets(h.root)).conflicts[0]?.reason).toContain('no preset baseline')
  await rm(path.join(h.root, assets[0]!.target))
  await repo.applyOrganizationPresetAssets(await repo.planOrganizationPresetAssets(h.root))
  await h.write(assets[0]!.target, base.replace('first = 1', 'first = 20'))
  await h.write('node_modules/@team/base/assets/check.ts', base.replace('first = 1', 'first = 10'))
  const before = await snapshot(h.root)
  const conflict = await repo.planOrganizationPresetAssets(h.root)
  expect(conflict.files[0]?.merge?.conflicts).toHaveLength(1)
  await expect(repo.applyOrganizationPresetAssets(conflict)).rejects.toThrow('blocked')
  expect(await snapshot(h.root)).toEqual(before)
  await rm(path.join(h.root, assets[0]!.target))
  expect((await repo.planOrganizationPresetAssets(h.root)).conflicts[0]?.reason).toContain('Locally deleted')
  const other = await h.install('@other/base', { ...manifest, assets })
  await h.write('node_modules/@other/base/assets/check.ts', base)
  await h.config({ presets: [other] })
  expect((await repo.planOrganizationPresetAssets(h.root)).conflicts[0]?.reason).toContain('another preset')
})

it('rejects cross-preset ownership and root-provider ownership without changing either baseline', async () => {
  const repo = await loadRepo()
  const h = await prepared()
  const other = await h.install('@other/base', { ...manifest, assets })
  await h.config({ presets: [{ packageName: '@team/base', version: '1.0.0' }, other] })
  expect((await repo.planOrganizationPresetAssets(h.root)).conflicts[0]?.reason).toContain('Multiple presets')
  await h.config({ presets: [{ packageName: '@team/base', version: '1.0.0' }] })
  const rootRecord = `.repoctl/baselines/root/${createHash('sha256').update(assets[0]!.target).digest('hex')}.json`
  await h.json(rootRecord, { owner: 'root-provider' })
  expect((await repo.planOrganizationPresetAssets(h.root)).conflicts[0]?.reason).toContain('root provider')
  expect(JSON.parse(await h.read(rootRecord))).toEqual({ owner: 'root-provider' })
})

it('root upgrades preserve organization-owned assets even with explicit overwrite enabled', async () => {
  const repo = await loadRepo()
  const h = await fixture()
  const ref = await h.install('@team/base', { ...manifest, assets: [{ source: 'editor', target: '.editorconfig' }] })
  await h.write('node_modules/@team/base/editor', 'root = true\n')
  await h.config({ presets: [ref] })
  await repo.applyOrganizationPresetAssets(await repo.planOrganizationPresetAssets(h.root))
  const before = await snapshot(h.root)
  const rootPlan = await repo.planUpgrade({ cwd: h.root, targets: ['.editorconfig'], mergeTargets: false, overwrite: true })
  expect(rootPlan.files.find(file => file.path === '.editorconfig')).toMatchObject({ status: 'conflict', reason: 'preset-owned-asset' })
  expect(await snapshot(h.root)).toEqual(before)
})

it('rejects tampered plans, stale package/config bytes, stale targets and foreign CLI workspaces', async () => {
  const repo = await loadRepo()
  const h = await prepared()
  const plan = await repo.planOrganizationPresetAssets(h.root)
  const tampered = structuredClone(plan)
  tampered.files[0]!.content = Buffer.from('unreviewed\n').toString('base64')
  await expect(repo.applyOrganizationPresetAssets(tampered)).rejects.toThrow('plan changed')
  await h.write('node_modules/@team/base/assets/check.ts', 'changed source\n')
  await expect(repo.applyOrganizationPresetAssets(plan)).rejects.toThrow('plan changed')
  await h.write('node_modules/@team/base/assets/check.ts', base)
  await h.config({ presets: [{ packageName: '@team/base', version: '1.0.0' }], commands: { ai: { force: true } } })
  await expect(repo.applyOrganizationPresetAssets(plan)).rejects.toThrow('plan changed')
  const fresh = await repo.planOrganizationPresetAssets(h.root)
  await h.write(assets[0]!.target, 'concurrent owner\n')
  await expect(repo.applyOrganizationPresetAssets(fresh)).rejects.toThrow('plan changed')
  const other = await fixture()
  await other.json('plan.json', plan)
  expect((await cli(other.root, ['presets', 'apply', 'plan.json'])).exitCode).toBe(1)
})

it('CLI exposes recommendations and saves a create-only review plan before explicit apply', async () => {
  const h = await prepared()
  const result = await cli(h.root, ['presets', 'plan', '--json', '--out', 'preset-plan.json'])
  expect(result.exitCode, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout).status).toBe('ready')
  await expect(h.read(assets[0]!.target)).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await cli(h.root, ['presets', 'plan', '--out', 'preset-plan.json'])).exitCode).toBe(1)
  const applied = await cli(h.root, ['presets', 'apply', 'preset-plan.json', '--json'])
  expect(applied.exitCode, applied.stderr).toBe(0)
  expect(JSON.parse(applied.stdout).status).toBe('applied')
  const inspect = await cli(h.root, ['presets', 'inspect', '--json'])
  expect(JSON.parse(inspect.stdout).presets[0]).toMatchObject({ id: '@team/base@1.0.0', assets })
})
