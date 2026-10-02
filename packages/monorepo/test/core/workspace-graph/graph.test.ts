import { rm } from 'node:fs/promises'
import path from 'node:path'
import { filterWorkspaceGraph, getWorkspaceGraph, resolveWorkspaceGraphNode } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { diamond, fingerprint, fixture, writePackage } from './fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })))
})

async function createFixture(...args: Parameters<typeof fixture>) {
  const cwd = await fixture(...args)
  roots.push(cwd)
  return cwd
}

describe('built workspace graph API', () => {
  it('discovers private apps, excludes the root and manifest exclusions, and refreshes repeated reads', async () => {
    const cwd = await createFixture({ ...diamond, 'packages/excluded': { name: 'excluded' } })
    const before = await fingerprint(cwd)
    const graph = await getWorkspaceGraph(cwd)
    expect(graph.schemaVersion).toBe(1)
    expect(graph.nodes.map(node => node.id)).toEqual(['apps/web', 'packages/a', 'packages/b', 'packages/base', 'packages/isolated', 'packages/tool'])
    expect(graph.edges).toHaveLength(6)
    expect(graph.nodes[0]).toMatchObject({ name: '@test/web', private: true })
    expect(await getWorkspaceGraph(cwd)).toEqual(graph)
    expect((await getWorkspaceGraph(path.join(cwd, 'apps/web'))).workspaceDir).toBe(cwd)
    expect(await fingerprint(cwd)).toEqual(before)
    await writePackage(cwd, 'packages/new', { name: '@test/new', dependencies: { '@test/base': 'workspace:*' } })
    expect((await getWorkspaceGraph(cwd)).nodes).toHaveLength(7)
    expect((await getWorkspaceGraph(cwd, { ignoreRootPackage: false })).nodes[0]?.id).toBe('.')
    expect((await getWorkspaceGraph(cwd, { ignorePrivatePackage: true })).nodes.some(node => node.private)).toBe(false)
  })

  it('resolves workspace aliases, relative paths, local directories and matching npm semver aliases', async () => {
    const cwd = await createFixture({
      'packages/consumer': { name: 'consumer', dependencies: {
        same: 'workspace:*',
        alias: 'workspace:@test/target@^1.0.0',
        scoped: 'workspace:@test/target@~',
        relative: 'workspace:../target',
        linked: 'link:../target',
        local: 'file:../target',
        registryAlias: 'npm:@test/target@^1.0.0',
        external: '^1.0.0',
      }, optionalDependencies: { '@test/target': '^1.0.0' } },
      'packages/same': { name: 'same' },
      'packages/target': { name: '@test/target' },
    })
    const graph = await getWorkspaceGraph(cwd)
    expect(graph.diagnostics).toEqual([])
    expect(graph.edges).toHaveLength(8)
    expect(graph.edges.find(edge => edge.dependency === 'alias')).toMatchObject({ target: 'packages/target', specifier: 'workspace:@test/target@^1.0.0', resolution: 'workspace' })
    expect(graph.edges.find(edge => edge.dependency === 'linked')).toMatchObject({ target: 'packages/target', resolution: 'local' })
    expect(graph.edges.find(edge => edge.type === 'optionalDependencies')).toMatchObject({ target: 'packages/target', resolution: 'semver' })
  })

  it('diagnoses forced workspace references without treating registry mismatches as internal edges', async () => {
    const cwd = await createFixture({
      'packages/consumer': { name: 'consumer', dependencies: {
        missing: 'workspace:*',
        relative: 'workspace:../missing',
        invalid: 'workspace:target@banana',
        incompatible: 'workspace:target@^2',
        target: '^2',
        registry: 'npm:target@latest',
        catalog: 'catalog:',
      } },
      'packages/target': { name: 'target' },
    })
    const graph = await getWorkspaceGraph(cwd)
    expect(graph.edges).toEqual([])
    expect(graph.diagnostics.map(item => [item.dependency, item.code])).toEqual([
      ['catalog', 'unresolved_specifier'],
      ['incompatible', 'incompatible_version'],
      ['invalid', 'invalid_specifier'],
      ['missing', 'unresolved_dependency'],
      ['registry', 'unresolved_specifier'],
      ['relative', 'unresolved_dependency'],
    ])
  })

  it('retains duplicate names as distinct nodes and refuses ambiguous name selection or dependencies', async () => {
    const cwd = await createFixture({
      'packages/a': { name: 'duplicate' },
      'packages/b': { name: 'duplicate' },
      'packages/consumer': { name: 'consumer', dependencies: { duplicate: 'workspace:*' } },
      'packages/unnamed': {},
    })
    const graph = await getWorkspaceGraph(cwd)
    expect(graph.nodes).toHaveLength(4)
    expect(graph.edges).toHaveLength(0)
    expect(graph.diagnostics.map(item => item.code)).toEqual(['duplicate_name', 'ambiguous_dependency'])
    expect(() => resolveWorkspaceGraphNode(graph, 'duplicate')).toThrow(/Ambiguous.*\.\/packages\/a.*\.\/packages\/b/)
    expect(resolveWorkspaceGraphNode(graph, './packages/a').id).toBe('packages/a')
    expect(resolveWorkspaceGraphNode(graph, './packages/unnamed').name).toBeUndefined()
    expect(() => resolveWorkspaceGraphNode(graph, 'absent')).toThrow('Workspace package not found')
  })

  it('filters dependency kinds and direct relationships without changing the original graph', async () => {
    const graph = await getWorkspaceGraph(await createFixture(diamond))
    const before = JSON.stringify(graph)
    const filtered = filterWorkspaceGraph(graph, { packages: ['@test/a'], dependencyTypes: ['dependencies'] })
    expect(filtered.nodes.map(node => node.id)).toEqual(['apps/web', 'packages/a', 'packages/base'])
    expect(filtered.edges.map(edge => [edge.source, edge.target])).toEqual([['apps/web', 'packages/a'], ['packages/a', 'packages/base']])
    expect(filterWorkspaceGraph(graph, { dependencyTypes: [] }).edges).toEqual([])
    expect(JSON.stringify(graph)).toBe(before)
    expect(() => filterWorkspaceGraph(graph, { dependencyTypes: ['invalid' as 'dependencies'] })).toThrow('Unknown dependency type')
  })
})
