import type { WorkspaceGraph } from '@icebreakers/monorepo'
import { rm } from 'node:fs/promises'
import { getWorkspaceGraph, getWorkspaceImpact, whyWorkspaceDependency } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { diamond, fixture } from './fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })))
})

async function graph() {
  const cwd = await fixture(diamond)
  roots.push(cwd)
  return getWorkspaceGraph(cwd)
}

describe('built workspace graph queries', () => {
  it('chooses one stable shortest path through a diamond and terminates on cycles', async () => {
    const data = await graph()
    const why = whyWorkspaceDependency(data, '@test/web', '@test/base')
    expect(why).toMatchObject({ found: true, path: ['apps/web', 'packages/a', 'packages/base'] })
    expect(why.edges.map(edge => [edge.source, edge.target])).toEqual([['apps/web', 'packages/a'], ['packages/a', 'packages/base']])
    expect(whyWorkspaceDependency(data, '@test/web', '@test/base')).toEqual(why)
    expect(whyWorkspaceDependency(data, '@test/base', '@test/isolated')).toMatchObject({ found: false, path: [], edges: [] })
    expect(whyWorkspaceDependency(data, '@test/base', '@test/base')).toMatchObject({ found: true, path: ['packages/base'], edges: [] })
    expect(whyWorkspaceDependency(data, '@test/base', '@test/a', { dependencyTypes: ['dependencies'] }).found).toBe(false)
    expect(whyWorkspaceDependency(data, '@test/base', '@test/a', { dependencyTypes: ['devDependencies'] }).path).toEqual(['packages/base', 'packages/a'])
  })

  it('distinguishes direct and transitive consumers, includes private apps and excludes the target in cycles', async () => {
    const data = await graph()
    const result = getWorkspaceImpact(data, '@test/base')
    expect(result.consumers).toEqual([
      { id: 'apps/web', distance: 2, direct: false, path: ['apps/web', 'packages/a', 'packages/base'] },
      { id: 'packages/a', distance: 1, direct: true, path: ['packages/a', 'packages/base'] },
      { id: 'packages/b', distance: 1, direct: true, path: ['packages/b', 'packages/base'] },
      { id: 'packages/tool', distance: 1, direct: true, path: ['packages/tool', 'packages/base'] },
    ])
    expect(getWorkspaceImpact(data, '@test/base', { direct: true }).consumers).toEqual(result.consumers.filter(node => node.direct))
    expect(getWorkspaceImpact(data, '@test/base', { dependencyTypes: ['peerDependencies'] }).consumers.map(node => node.id)).toEqual(['packages/tool'])
    expect(getWorkspaceImpact(data, '@test/isolated').consumers).toEqual([])
    expect(getWorkspaceImpact(data, '@test/base')).toEqual(result)
  })

  it('bounds dense cyclic queries to one shortest path instead of enumerating combinations', () => {
    const nodes = Array.from({ length: 60 }, (_, i) => ({ id: `p${String(i).padStart(2, '0')}`, private: false }))
    const data: WorkspaceGraph = {
      schemaVersion: 1,
      cwd: '/fixture',
      workspaceDir: '/fixture',
      dependencyTypes: ['dependencies'],
      nodes,
      edges: nodes.flatMap(source => nodes.filter(target => target.id !== source.id).map(target => ({
        source: source.id,
        target: target.id,
        type: 'dependencies',
        dependency: target.id,
        specifier: 'workspace:*',
        resolution: 'workspace',
      }))),
      diagnostics: [],
    }
    expect(whyWorkspaceDependency(data, 'p00', 'p59').path).toEqual(['p00', 'p59'])
    expect(getWorkspaceImpact(data, 'p00').consumers).toHaveLength(59)
    expect(getWorkspaceImpact(data, 'p00').consumers.every(node => node.direct)).toBe(true)
  })
})
