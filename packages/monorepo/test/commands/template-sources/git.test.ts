import { rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { cli, exists, gitFixture, json, loadRepo } from './fixtures'

let repo: Awaited<ReturnType<typeof loadRepo>>
beforeAll(async () => {
  repo = await loadRepo()
}, 30_000)

describe('fixed Git template assets', () => {
  it('uses the exact commit and subdirectory online and offline without running package scripts', async () => {
    const fixture = await gitFixture()
    const result = await repo.resolveRemoteTemplateSource(fixture.remote, 'templates/sample', fixture)
    expect(result.resolved).toMatchObject({ kind: 'git', requestedRef: fixture.commit, commit: fixture.commit })
    await rename(fixture.packageDir, `${fixture.packageDir}-offline`)
    const repeated = await repo.resolveRemoteTemplateSource(fixture.remote, 'templates/sample', { ...fixture, offline: true })
    expect(repeated.digest).toBe(result.digest)
    const created = await cli(fixture.cwd, ['new', 'demo', '--template', 'custom', '--offline'])
    expect(created.exitCode, created.stderr).toBe(0)
    const registry = await json(path.join(fixture.cwd, '.repoctl/template-instances.json'))
    expect(registry.instances[0].source.remote).toMatchObject({ kind: 'git', commit: fixture.commit })
    expect(await exists(fixture.scriptMarker)).toBe(false)
  }, 60_000)

  it('pins a moving ref to its verified cached commit and diagnoses unavailable sources', async () => {
    const fixture = await gitFixture()
    const branch = (await fixture.git(['branch', '--show-current'])).stdout
    const remote = { ...fixture.remote, ref: branch } as typeof fixture.remote
    const first = await repo.resolveRemoteTemplateSource(remote, 'templates/sample', fixture)
    await writeFile(path.join(fixture.packageDir, 'templates/sample/index.js'), 'export const value = 99')
    await fixture.git(['add', '.'])
    await fixture.git(['commit', '-m', 'change'])
    const second = await repo.resolveRemoteTemplateSource(remote, 'templates/sample', fixture)
    expect(second.resolved).toEqual(first.resolved)
    expect(second.cache).toBe('hit')
    await expect(repo.resolveRemoteTemplateSource({ ...fixture.remote, ref: 'missing-ref' } as typeof fixture.remote, '.', fixture)).rejects.toThrow('Verify the repository and ref')
    await expect(repo.resolveRemoteTemplateSource(fixture.remote, 'missing-directory', fixture)).rejects.toThrow('does not contain template directory')
    await expect(repo.resolveRemoteTemplateSource(fixture.remote, '../outside', fixture)).rejects.toThrow('portable relative')
    for (const ref of ['refs/heads/*', '^main', 'main:other', 'main~1', 'main..other']) {
      await expect(repo.resolveRemoteTemplateSource({ ...fixture.remote, ref } as typeof fixture.remote, '.', fixture)).rejects.toThrow('explicit ref or commit')
    }
    expect(await exists(path.join(fixture.cwd, 'packages/custom/package.json'))).toBe(false)
  }, 60_000)
})
