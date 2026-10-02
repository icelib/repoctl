import { rm } from 'node:fs/promises'
import { getWorkspaceGraph, getWorkspaceImpact, whyWorkspaceDependency } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { cli, diamond, fingerprint, fixture } from './fixture'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(cwd => rm(cwd, { recursive: true, force: true })))
})

async function createFixture(...args: Parameters<typeof fixture>) {
  const cwd = await fixture(...args)
  roots.push(cwd)
  return cwd
}

describe('built repoctl workspace CLI', () => {
  it('uses the public graph model for every JSON query and never writes project files', async () => {
    const cwd = await createFixture(diamond)
    const before = await fingerprint(cwd)
    const graph = await getWorkspaceGraph(cwd)
    expect(JSON.parse(cli(cwd, ['graph', '--json']))).toEqual(graph)
    expect(JSON.parse(cli(cwd, ['why', '@test/web', '@test/base', '--json']))).toEqual(whyWorkspaceDependency(graph, '@test/web', '@test/base'))
    expect(JSON.parse(cli(cwd, ['impact', '@test/base', '--json']))).toEqual(getWorkspaceImpact(graph, '@test/base'))
    expect(cli(cwd, ['graph', '--json'])).toBe(cli(cwd, ['graph', '--json']))
    expect(await fingerprint(cwd)).toEqual(before)
  })

  it('provides readable terminal summaries, Mermaid export, selectors, kind filters and direct impact', async () => {
    const cwd = await createFixture(diamond)
    expect(cli(cwd, ['graph'])).toContain('apps/web -> packages/a [dependencies]')
    expect(cli(cwd, ['why', '@test/web', '@test/base'])).toContain('apps/web -> packages/a -> packages/base')
    expect(cli(cwd, ['impact', '@test/base'])).toContain('apps/web [transitive; 2]')
    expect(cli(cwd, ['graph', '--mermaid'])).toContain('flowchart LR\n')
    expect(cli(cwd, ['graph', '--mermaid'])).toContain('-->|"dependencies: @test/a"|')
    const filtered = JSON.parse(cli(cwd, ['graph', '--package', '@test/a', '--type', 'dependencies', '--json']))
    expect(filtered.nodes.map((node: { id: string }) => node.id)).toEqual(['apps/web', 'packages/a', 'packages/base'])
    const direct = JSON.parse(cli(cwd, ['impact', '@test/base', '--direct', '--type', 'dependencies', '--json']))
    expect(direct.consumers.map((node: { id: string }) => node.id)).toEqual(['packages/a', 'packages/b'])
    const redacted = cli(cwd, ['graph', '--redact', '--json'])
    expect(redacted).not.toContain(cwd)
    expect(JSON.parse(redacted).workspaceDir).toBe('<workspace>')
  })

  it('fails unknown or ambiguous selectors and invalid options without writing files', async () => {
    const cwd = await createFixture({ 'packages/a': { name: 'same' }, 'packages/b': { name: 'same' } })
    const before = await fingerprint(cwd)
    for (const args of [
      ['graph', '--type', 'dev'],
      ['graph', '--json', '--mermaid'],
      ['impact', 'same'],
      ['why', './packages/a', 'missing'],
    ]) {
      expect(() => cli(cwd, args)).toThrow()
    }
    expect(JSON.parse(cli(cwd, ['impact', './packages/a', '--json'])).target).toBe('packages/a')
    expect(await fingerprint(cwd)).toEqual(before)
  })
})
