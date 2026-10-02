import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { clearWorkspaceCache, createNewProject, initMetadata } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let root: string

beforeEach(async () => {
  clearWorkspaceCache()
  root = await mkdtemp(path.join(tmpdir(), 'repoctl-metadata-alias-'))
})

afterEach(async () => {
  clearWorkspaceCache()
  await rm(root, { recursive: true, force: true })
})

async function fixture(nested = false) {
  const gitRoot = path.join(root, 'repository')
  const workspace = nested ? path.join(gitRoot, 'nested/workspace') : gitRoot
  const alias = path.join(root, 'alias')
  await mkdir(path.join(workspace, 'services/api'), { recursive: true })
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=', ...args], { cwd: gitRoot, encoding: 'utf8' })
  git('init', '-q')
  git('config', 'user.name', 'Repoctl Fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('remote', 'add', 'origin', 'https://github.com/example/fixture.git')
  await writeFile(path.join(workspace, 'package.json'), JSON.stringify({ name: 'fixture', private: true }))
  await writeFile(path.join(workspace, 'pnpm-workspace.yaml'), 'packages: [services/*]\n')
  await writeFile(path.join(workspace, 'services/api/package.json'), JSON.stringify({ name: 'api', version: '1.0.0' }))
  await symlink(workspace, alias, 'junction')
  return { gitRoot, workspace, alias }
}

async function repositoryDirectory(packageDir: string) {
  const manifest = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'))
  return manifest.repository?.directory
}

describe('built command metadata with directory aliases', () => {
  it.each([false, true])('creates Git-relative metadata through a workspace alias (nested: %s)', async (nested) => {
    const { workspace, alias } = await fixture(nested)
    await createNewProject({ cwd: alias, name: 'services/new', type: 'tsdown' })
    expect(await repositoryDirectory(path.join(workspace, 'services/new')))
      .toBe(nested ? 'nested/workspace/services/new' : 'services/new')
  })

  it('resolves an existing aliased parent before adding the missing target suffix', async () => {
    const { workspace, alias } = await fixture()
    await symlink(path.join(workspace, 'services'), path.join(workspace, 'linked-services'), 'junction')
    await createNewProject({ cwd: alias, name: 'linked-services/deep/new', type: 'tsdown' })
    expect(await repositoryDirectory(path.join(workspace, 'services/deep/new'))).toBe('services/deep/new')
  })

  it.each([false, true])('initializes Git-relative metadata and README-relative links (nested: %s)', async (nested) => {
    const { workspace, alias } = await fixture(nested)
    await initMetadata(alias)
    expect(await repositoryDirectory(path.join(workspace, 'services/api')))
      .toBe(nested ? 'nested/workspace/services/api' : 'services/api')
    const readmePath = path.join(workspace, 'README.md')
    const readme = await readFile(readmePath, 'utf8')
    expect(readme).toContain('- [api](services/api)')
    expect(readme).not.toContain('../alias')
    expect(readme).not.toContain('../repository')

    const packagePath = path.join(workspace, 'services/api/package.json')
    const first = await readFile(packagePath, 'utf8')
    await initMetadata(workspace)
    expect(await readFile(packagePath, 'utf8')).toBe(first)
    expect(await readFile(readmePath, 'utf8')).toBe(readme)
  })

  it('keeps initialization and README ownership in the supplied nested directory', async () => {
    const { workspace, alias } = await fixture()
    const parentReadme = '# User README\n'
    const parentManifest = await readFile(path.join(workspace, 'pnpm-workspace.yaml'), 'utf8')
    await writeFile(path.join(workspace, 'README.md'), parentReadme)
    const nested = path.join(workspace, 'independent')
    await mkdir(path.join(nested, 'packages/child'), { recursive: true })
    await writeFile(path.join(nested, 'packages/child/package.json'), JSON.stringify({ name: 'child', version: '1.0.0' }))

    await initMetadata(path.join(alias, 'independent'))

    expect(await repositoryDirectory(path.join(nested, 'packages/child'))).toBe('independent/packages/child')
    expect(await readFile(path.join(nested, 'README.md'), 'utf8')).toContain('- [child](packages/child)')
    expect(await readFile(path.join(workspace, 'README.md'), 'utf8')).toBe(parentReadme)
    expect(await readFile(path.join(workspace, 'pnpm-workspace.yaml'), 'utf8')).toBe(parentManifest)
  })
})
