import { createHash } from 'node:crypto'
import { cp, link, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { c } from 'tar'
import { beforeAll, describe, expect, it } from 'vitest'
import { exists, loadRepo, npmFixture, unsafeArchive } from './fixtures'

let repo: Awaited<ReturnType<typeof loadRepo>>
beforeAll(async () => {
  repo = await loadRepo()
}, 30_000)

describe('remote template acquisition boundaries', () => {
  it.each([
    ['package/../../escape.txt', false],
    ['package/link', true],
    ['package/C:/escape.txt', false],
    ['package/CON.txt', false],
    ['package/trailing.', false],
    ['package/question?.txt', false],
    [['package/name', 'package/NAME'], false],
    [['package/caf\u00E9', 'package/cafe\u0301'], false],
  ])('rejects unsafe archive %s without target writes', async (name, link) => {
    const fixture = await npmFixture()
    fixture.state.bytes = unsafeArchive(name as string | string[], Boolean(link))
    fixture.state.integrity = `sha512-${createHash('sha512').update(fixture.state.bytes).digest('base64')}`
    await expect(repo.createNewProject({ cwd: fixture.cwd, type: 'custom' })).rejects.toThrow('unsafe paths')
    expect(await readdir(fixture.cwd)).toEqual(expect.arrayContaining(['package.json', 'repoctl.config.mjs', 'pnpm-workspace.yaml']))
    expect(await exists(path.join(fixture.cwd, 'packages/custom/package.json'))).toBe(false)
    expect(await readdir(fixture.cwd)).not.toContain('packages')
    expect(await readdir(fixture.cacheDir)).toEqual([])
  })

  it.each(['integrity', 'auth', 'identity'])('rejects %s failures without exposing credentials', async (failure) => {
    const fixture = await npmFixture()
    if (failure === 'integrity') {
      fixture.state.integrity = `sha512-${createHash('sha512').update('different').digest('base64')}`
    }
    if (failure === 'auth') {
      fixture.state.rejectAuth = true
    }
    if (failure === 'identity') {
      fixture.state.version = '9.9.9'
    }
    const error = await repo.createNewProject({ cwd: fixture.cwd, type: 'custom' }).catch(error => error as Error)
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain(fixture.token)
    expect(await exists(path.join(fixture.cwd, 'packages/custom/package.json'))).toBe(false)
    expect(await readdir(fixture.cwd)).not.toContain('packages')
    expect(await readdir(fixture.cacheDir)).toEqual([])
  })

  it('rejects cached assets and a matching rewritten manifest when they differ from the original archive', async () => {
    const fixture = await npmFixture()
    const first = await repo.resolveRemoteTemplateSource(fixture.remote, 'templates/sample', fixture)
    await writeFile(path.join(fixture.packageDir, 'templates/sample/index.js'), 'export const value = 99')
    const archive = path.join(fixture.root, 'updated.tgz')
    await c({ file: archive, gzip: true, cwd: fixture.root }, ['package'])
    fixture.state.bytes = await readFile(archive)
    fixture.state.integrity = `sha512-${createHash('sha512').update(fixture.state.bytes).digest('base64')}`
    const second = await repo.resolveRemoteTemplateSource(fixture.remote, 'templates/sample', { ...fixture, cacheDir: `${fixture.cacheDir}-second` })
    await cp(path.resolve(second.sourceDir, '../..'), path.resolve(first.sourceDir, '../..'), { recursive: true, force: true })
    const manifestFile = path.resolve(first.sourceDir, '../../../manifest.json')
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
    manifest.digest = second.digest
    await writeFile(manifestFile, JSON.stringify(manifest))
    await expect(repo.resolveRemoteTemplateSource(fixture.remote, 'templates/sample', { ...fixture, offline: true })).rejects.toThrow('integrity verification')
  })

  it('refuses hardlinked cache files', async () => {
    const fixture = await npmFixture()
    const fetched = await repo.resolveRemoteTemplateSource(fixture.remote, 'templates/sample', fixture)
    await link(path.join(fetched.sourceDir, 'index.js'), path.join(fixture.root, 'external-hardlink'))
    await expect(repo.resolveRemoteTemplateSource(fixture.remote, 'templates/sample', { ...fixture, offline: true })).rejects.toThrow('integrity verification')
  })
})
