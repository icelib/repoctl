import { link, readFile, rename, symlink, writeFile } from 'node:fs/promises'
import { applyCatalogMigrationPlan, checkCatalogs, planCatalogMigration } from '@icebreakers/monorepo'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { fixture, runCli, snapshot, writeJson } from '../deps/fixture'

const selection = { dependency: 'dep', section: 'devDependencies' as const }
async function editable() {
  const h = await fixture({
    'packages/a': { devDependencies: { dep: '^1', keep: 'workspace:*' }, peerDependencies: { dep: '^1 || ^2' }, scripts: { build: 'echo unchanged' } },
    'packages/b': { devDependencies: { dep: '^1' } },
  })
  await writeFile(`${h.workspace}/pnpm-workspace.yaml`, '# workspace header\npackages: [packages/*]\n# preserve this policy\nminimumReleaseAge: 1440\ncatalogs:\n  legacy:\n    dep: ^2 # old consumers\ncustom: { keep: true }\n')
  return h
}

describe('built catalog migration plans', () => {
  it('previews both file types, applies only reviewed changes and is idempotent', async () => {
    const h = await editable()
    const before = await snapshot(h.root)
    const result = runCli(h, ['catalog', 'plan', 'dep', '--section', 'devDependencies', '--dry-run', '--json'], path.join(h.workspace, 'packages/a'))
    expect(result.status, result.stderr).toBe(0)
    const plan = JSON.parse(result.stdout)
    expect(plan).toEqual(await planCatalogMigration(h.workspace, selection))
    expect(plan.files.map((file: { path: string }) => file.path)).toEqual(['packages/a/package.json', 'packages/b/package.json', 'pnpm-workspace.yaml'])
    expect(await snapshot(h.root)).toEqual(before)
    const planFile = path.join(h.root, 'plan.json')
    await writeJson(planFile, plan)
    const applied = runCli(h, ['catalog', 'apply', planFile, '--json'])
    expect(applied.status, applied.stderr).toBe(0)
    expect(JSON.parse(applied.stdout).status).toBe('applied')
    const yaml = await readFile(`${h.workspace}/pnpm-workspace.yaml`, 'utf8')
    expect(yaml).toContain('# workspace header')
    expect(yaml).toContain('# preserve this policy')
    expect(yaml).toContain('# old consumers')
    expect(YAML.parse(yaml)).toMatchObject({ catalog: { dep: '^1' }, catalogs: { legacy: { dep: '^2' } }, minimumReleaseAge: 1440, custom: { keep: true } })
    const manifest = JSON.parse(await readFile(`${h.workspace}/packages/a/package.json`, 'utf8'))
    expect(manifest).toMatchObject({ devDependencies: { dep: 'catalog:', keep: 'workspace:*' }, peerDependencies: { dep: '^1 || ^2' }, scripts: { build: 'echo unchanged' } })
    const after = await snapshot(h.root)
    expect(await applyCatalogMigrationPlan(h.workspace, plan)).toMatchObject({ status: 'unchanged', changed: [] })
    expect((await planCatalogMigration(h.workspace, selection)).files).toEqual([])
    expect(await snapshot(h.root)).toEqual(after)
  })

  it('adds named catalogs without touching existing entries, and preserves default catalog location', async () => {
    const h = await editable()
    await expect(planCatalogMigration(h.workspace, { ...selection, catalog: 'legacy' })).rejects.toThrow('existing_entry_conflict')
    const named = await planCatalogMigration(h.workspace, { ...selection, catalog: 'modern' })
    await applyCatalogMigrationPlan(h.workspace, named)
    expect((await checkCatalogs(h.workspace)).references.filter(item => item.name === 'dep').every(item => item.catalog === 'modern')).toBe(true)
    const other = await fixture({ 'packages/a': { dependencies: { fresh: '^1' } } })
    await writeFile(`${other.workspace}/pnpm-workspace.yaml`, 'packages: [packages/*]\ncatalogs:\n  default:\n    keep: ^2 # stay here\n')
    await applyCatalogMigrationPlan(other.workspace, await planCatalogMigration(other.workspace, { dependency: 'fresh', section: 'dependencies' }))
    const workspace = YAML.parse(await readFile(`${other.workspace}/pnpm-workspace.yaml`, 'utf8'))
    expect(workspace.catalog).toBeUndefined()
    expect(workspace.catalogs.default).toEqual({ keep: '^2', fresh: '^1' })
  })

  it.each(['yaml', 'manifest', 'new-package', 'partial', 'tampered'])('rejects %s drift before replacing any other file', async (kind) => {
    const h = await editable()
    const plan = await planCatalogMigration(h.workspace, selection)
    if (kind === 'yaml') {
      await writeFile(`${h.workspace}/pnpm-workspace.yaml`, 'packages: [packages/*]\n# concurrent edit\n')
    }
    else if (kind === 'manifest') {
      await writeJson(`${h.workspace}/packages/b/package.json`, { name: 'b', devDependencies: { dep: '^9' } })
    }
    else if (kind === 'new-package') {
      await writeJson(`${h.workspace}/packages/new/package.json`, { name: 'new', dependencies: { dep: '^1' } })
    }
    else if (kind === 'partial') {
      await writeFile(`${h.workspace}/${plan.files[0]!.path}`, plan.files[0]!.after)
    }
    else {
      plan.files.at(-1)!.after += 'unreviewed: true\n'
    }
    const before = await snapshot(h.root)
    await expect(applyCatalogMigrationPlan(h.workspace, plan)).rejects.toThrow()
    expect(await snapshot(h.root)).toEqual(before)
  })

  it.each(['symbolic', 'hard'])('refuses %s linked workspace YAML', async (kind) => {
    const h = await editable()
    const yaml = `${h.workspace}/pnpm-workspace.yaml`
    const outside = `${h.root}/linked.yaml`
    if (kind === 'symbolic') {
      await rename(yaml, outside)
      await symlink(outside, yaml)
    }
    else {
      await link(yaml, outside)
    }
    const before = await snapshot(h.root)
    await expect(planCatalogMigration(h.workspace, selection)).rejects.toThrow('Linked')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('does not change YAML anchor consumers when a catalog mapping is shared', async () => {
    const h = await editable()
    await writeFile(`${h.workspace}/pnpm-workspace.yaml`, 'packages: [packages/*]\ncatalog: &shared\n  keep: ^1\ncustom: *shared\n')
    const before = await snapshot(h.root)
    await expect(planCatalogMigration(h.workspace, selection)).rejects.toThrow('anchored or aliased')
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('rejects a changed imported policy even when the selected declarations remain the same', async () => {
    const h = await editable()
    await writeFile(`${h.workspace}/repoctl.config.mjs`, 'import groups from "./groups.mjs"; export default { commands: { deps: { groups } } }\n')
    await writeFile(`${h.workspace}/groups.mjs`, 'export default []\n')
    const plan = await planCatalogMigration(h.workspace, selection)
    expect(plan.inputs.some(input => input.path === 'groups.mjs')).toBe(true)
    await writeFile(`${h.workspace}/groups.mjs`, 'export default [] // reviewed policy changed\n')
    const before = await snapshot(h.root)
    await expect(applyCatalogMigrationPlan(h.workspace, plan)).rejects.toThrow('groups.mjs changed')
    expect(await snapshot(h.root)).toEqual(before)
  })
})
