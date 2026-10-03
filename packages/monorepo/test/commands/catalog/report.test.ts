import { writeFile } from 'node:fs/promises'
import { checkCatalogs, checkDependencies, planCatalogMigration } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { fixture, policy, runCli, snapshot } from '../deps/fixture'

describe('built catalog inspection', () => {
  it('reports default/named references, missing entries, unused entries and selected direct declarations precisely', async () => {
    const h = await fixture({
      'packages/a': { dependencies: { dep: 'catalog:default', old: 'catalog:legacy', missing: 'catalog:', absent: 'catalog:absent' }, peerDependencies: { peer: '^1 || ^2' } },
      'packages/b': { devDependencies: { dep: '^1' } },
    })
    await writeFile(`${h.workspace}/pnpm-workspace.yaml`, 'packages: [packages/*]\ncatalog:\n  dep: ^1\n  peer: ^2\n  unused: ^3\n  unknown: github:example/repo\ncatalogs:\n  legacy:\n    old: ^1\n')
    const before = await snapshot(h.root)
    const report = await checkCatalogs(h.workspace)
    expect(report.references.find(item => item.name === 'dep')).toMatchObject({ catalog: 'default', status: 'resolved', source: 'dep', path: 'packages/a/package.json', section: 'dependencies' })
    expect(report.references.find(item => item.name === 'old')?.status).toBe('resolved')
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_entry', dependency: 'missing', path: 'packages/a/package.json' }),
      expect.objectContaining({ code: 'missing_catalog', catalog: 'absent', dependency: 'absent' }),
      expect.objectContaining({ code: 'unused_entry', dependency: 'unused', path: 'pnpm-workspace.yaml' }),
      expect.objectContaining({ code: 'uncomparable_entry', dependency: 'unknown' }),
      expect.objectContaining({ code: 'direct_declaration', dependency: 'dep', path: 'packages/b/package.json', section: 'devDependencies' }),
    ]))
    expect(report.findings.some(item => item.code === 'direct_declaration' && item.dependency === 'peer')).toBe(false)
    const cli = runCli(h, ['catalog', 'check', '--json'])
    expect(cli.status).toBe(1)
    expect(JSON.parse(cli.stdout)).toEqual(report)
    expect(JSON.parse(runCli(h, ['catalog', 'check', '--json'], h.workspace, 'zh-CN').stdout)).toEqual(report)
    expect(await snapshot(h.root)).toEqual(before)
  })

  it('resolves both default catalog spellings and refuses two simultaneous default definitions', async () => {
    const h = await fixture({ 'packages/a': { dependencies: { dep: 'catalog:' } }, 'packages/b': { dependencies: { dep: 'catalog:default' } } })
    await writeFile(`${h.workspace}/pnpm-workspace.yaml`, 'packages: [packages/*]\ncatalogs:\n  default:\n    dep: ^1\n')
    expect((await checkCatalogs(h.workspace)).references.every(item => item.status === 'resolved')).toBe(true)
    expect((await checkDependencies(h.workspace)).groups[0]?.occurrences.every(item => item.range !== null)).toBe(true)
    await writeFile(`${h.workspace}/pnpm-workspace.yaml`, 'packages: [packages/*]\ncatalog: { dep: ^2 }\ncatalogs:\n  default:\n    dep: ^1\n')
    await expect(checkCatalogs(h.workspace)).rejects.toThrow('defined twice')
    expect((await checkDependencies(h.workspace)).groups[0]?.status).toBe('uncomparable')
  })

  it('accounts for catalog references in overrides and never labels uncertain nested selectors as unused', async () => {
    const h = await fixture()
    await writeFile(`${h.workspace}/pnpm-workspace.yaml`, 'packages: [packages/*]\ncatalog: { dep: ^1 }\ncatalogs:\n  legacy: { uncertain: ^2 }\noverrides:\n  dep@>=1: catalog:default\n  parent>child: catalog:legacy\n')
    const report = await checkCatalogs(h.workspace)
    expect(report.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'dep', section: 'overrides', status: 'resolved' }),
      expect.objectContaining({ name: 'parent>child', section: 'overrides', status: 'unresolved_selector' }),
    ]))
    expect(report.entries.find(item => item.dependency === 'dep')?.status).toBe('used')
    expect(report.entries.find(item => item.dependency === 'uncertain')?.status).toBe('usage_unknown')
    expect(report.summary.unused).toBe(0)
  })

  it('uses consistency cohorts, preserves peer contracts and requires explicit common subranges', async () => {
    const h = await fixture({
      'packages/a': { dependencies: { same: '^1', overlap: '^1', conflict: '^1', local: 'workspace:*', unknown: 'next', alias: 'npm:@scope/actual@^1' }, peerDependencies: { peer: '^1 || ^2' } },
      'packages/b': { dependencies: { same: '^1', overlap: '~1.2.0', conflict: '^2', local: 'workspace:*', unknown: 'next', alias: 'npm:@scope/actual@^1' } },
    })
    const report = await checkCatalogs(h.workspace)
    const candidates = Object.fromEntries(report.candidates.map(item => [item.dependency, [item.status, item.reason]]))
    expect(candidates).toMatchObject({ same: ['ready', 'equivalent_ranges'], overlap: ['needs_target', 'target_required'], conflict: ['blocked', 'incompatible_ranges'], peer: ['blocked', 'peer_range'], local: ['blocked', 'unsupported_protocol'], unknown: ['blocked', 'unsupported_protocol'], alias: ['ready', 'equivalent_ranges'] })
    await expect(planCatalogMigration(h.workspace, { dependency: 'overlap', section: 'dependencies' })).rejects.toThrow('target_required')
    expect((await planCatalogMigration(h.workspace, { dependency: 'overlap', section: 'dependencies', to: '~1.2.0' })).selection.to).toBe('~1.2.0')
    await expect(planCatalogMigration(h.workspace, { dependency: 'overlap', section: 'dependencies', to: '^1.2.0' })).rejects.toThrow('target_not_subset')
    await expect(planCatalogMigration(h.workspace, { dependency: 'alias', section: 'dependencies', to: 'npm:another@^1' })).rejects.toThrow('unsupported_protocol')
    await policy(h.workspace, [{ name: 'legacy', workspaces: ['packages/b'], dependencies: ['conflict'], reason: 'Version 2 consumer' }])
    const named = await planCatalogMigration(h.workspace, { dependency: 'conflict', section: 'dependencies', group: 'legacy', catalog: 'v2' })
    expect(named.selection).toMatchObject({ catalog: 'v2', to: '^2' })
    expect(named.consumers.map(item => item.path)).toEqual(['packages/b/package.json'])
  })

  it('accepts an exact prerelease target only when every original range admits it', async () => {
    const h = await fixture({
      'packages/a': { dependencies: { dep: '^1.0.0-beta.0' } },
      'packages/b': { dependencies: { dep: '^1.0.0-beta.1' } },
    })
    const selection = { dependency: 'dep', section: 'dependencies' as const, to: '1.0.0-beta.1' }
    expect((await planCatalogMigration(h.workspace, selection)).selection.to).toBe('1.0.0-beta.1')
    await expect(planCatalogMigration(h.workspace, { ...selection, to: '1.0.0-beta.0' })).rejects.toThrow('target_not_subset')
    const stable = await fixture({ 'packages/a': { dependencies: { dep: '^1' } } })
    await expect(planCatalogMigration(stable.workspace, selection)).rejects.toThrow('target_not_subset')
  })

  it('reloads edited policy groups before planning against a new input snapshot', async () => {
    const h = await fixture({
      'packages/a': { dependencies: { dep: '^1' } },
      'packages/b': { dependencies: { dep: '^2' } },
    })
    const group = { name: 'selected', dependencies: ['dep'], reason: 'Intentional version cohort' }
    await policy(h.workspace, [{ ...group, workspaces: ['packages/a'] }])
    const options = { dependency: 'dep', section: 'dependencies' as const, group: 'selected', catalog: 'selected' }
    expect((await planCatalogMigration(h.workspace, options)).selection.to).toBe('^1')
    await policy(h.workspace, [{ ...group, workspaces: ['packages/b'] }])
    const refreshed = await planCatalogMigration(h.workspace, options)
    expect(refreshed.selection.to).toBe('^2')
    expect(refreshed.consumers.map(item => item.workspace)).toEqual(['packages/b'])
  })

  it('refreshes local policy imports and includes them in the reviewed snapshot', async () => {
    const h = await fixture({
      'packages/a': { dependencies: { dep: '^1' } },
      'packages/b': { dependencies: { dep: '^2' } },
    })
    await writeFile(`${h.workspace}/repoctl.config.mjs`, 'import groups from "./groups.mjs"; export default { commands: { deps: { groups } } }\n')
    const group = { name: 'selected', dependencies: ['dep'], reason: 'Intentional version cohort' }
    const update = (workspace: string) => writeFile(`${h.workspace}/groups.mjs`, `export default ${JSON.stringify([{ ...group, workspaces: [workspace] }])}\n`)
    const options = { dependency: 'dep', section: 'dependencies' as const, group: 'selected', catalog: 'selected' }
    await update('packages/a')
    expect((await planCatalogMigration(h.workspace, options)).selection.to).toBe('^1')
    await update('packages/b')
    const refreshed = await planCatalogMigration(h.workspace, options)
    expect(refreshed.selection.to).toBe('^2')
    expect(refreshed.inputs.some(input => input.path === 'groups.mjs')).toBe(true)
  })
})
