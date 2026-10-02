import { mkdir, mkdtemp, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { clearWorkspaceCache, getWorkspaceData, getWorkspacePackages, getWorkspacePackageSummaries } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let root: string
let workspace: string
let alias: string

async function writeWorkspace(directory: string, name = 'root') {
  await mkdir(path.join(directory, 'packages/public'), { recursive: true })
  await mkdir(path.join(directory, 'packages/private'), { recursive: true })
  await writeFile(path.join(directory, 'pnpm-workspace.yaml'), 'packages: [packages/*]\n')
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
  await writeFile(path.join(directory, 'packages/public/package.json'), JSON.stringify({ name: `${name}-public`, version: '1.0.0' }))
  await writeFile(path.join(directory, 'packages/private/package.json'), JSON.stringify({ name: `${name}-private`, version: '1.0.0', private: true }))
}

beforeEach(async () => {
  clearWorkspaceCache()
  root = await mkdtemp(path.join(tmpdir(), 'repoctl-workspace-alias-'))
  workspace = path.join(root, 'workspace')
  alias = path.join(root, 'alias')
  await writeWorkspace(workspace)
  await symlink(workspace, alias, 'junction')
})

afterEach(async () => {
  clearWorkspaceCache()
  await rm(root, { recursive: true, force: true })
})

describe('built workspace APIs with directory aliases', () => {
  it.each(['physical', 'alias'] as const)('excludes the root package through the %s directory', async (kind) => {
    const input = kind === 'physical' ? await realpath(workspace) : alias
    const packages = await getWorkspacePackages(input)
    expect(packages.map(pkg => pkg.manifest.name)).toEqual(['root-public'])
    expect(packages[0]?.rootDir).toBe(path.join(await realpath(workspace), 'packages/public'))
  })

  it('includes the root exactly once when explicitly requested through an alias', async () => {
    const options = { ignoreRootPackage: false, ignorePrivatePackage: false }
    const packages = await getWorkspacePackages(alias, options)
    const data = await getWorkspaceData(alias, options)
    expect(packages.map(pkg => pkg.manifest)).toEqual(data.packages.map(pkg => pkg.manifest))
    expect(packages.map(pkg => pkg.manifest.name).sort()).toEqual(['root', 'root-private', 'root-public'])
    expect(packages.filter(pkg => pkg.rootDir === data.workspaceDir)).toHaveLength(1)
  })

  it('honors explicit patterns and private-package options through an alias', async () => {
    const packages = await getWorkspacePackages(alias, { patterns: ['packages/private'], ignorePrivatePackage: false })
    expect(packages.map(pkg => pkg.manifest.name)).toEqual(['root-private'])
    expect(packages[0]?.pkgJsonPath).toBe(path.join(await realpath(workspace), 'packages/private/package.json'))
  })

  it('uses one physical workspace boundary when no workspace manifest exists', async () => {
    await unlink(path.join(workspace, 'pnpm-workspace.yaml'))
    const data = await getWorkspaceData(alias, { patterns: ['packages/*'] })
    expect(data.cwd).toBe(alias)
    expect(data.workspaceDir).toBe(path.resolve(await realpath(workspace)))
    expect(data.packages.map(pkg => pkg.manifest.name)).toEqual(['root-public'])

    const summaries = await getWorkspacePackageSummaries(alias, { patterns: ['packages/*'], ignoreRootPackage: false })
    expect(summaries.packages.map(pkg => pkg.relativeDir)).toEqual(['.', 'packages/public'])
  })

  it('does not confuse a retargeted alias with the previous physical workspace', async () => {
    expect((await getWorkspaceData(alias)).packages.map(pkg => pkg.manifest.name)).toEqual(['root-public'])
    const second = path.join(root, 'second')
    await writeWorkspace(second, 'second')
    await unlink(alias)
    await symlink(second, alias, 'junction')

    const packages = await getWorkspacePackages(alias)
    const data = await getWorkspaceData(alias)
    expect(packages.map(pkg => pkg.manifest.name)).toEqual(['second-public'])
    expect(data.packages.map(pkg => pkg.manifest)).toEqual(packages.map(pkg => pkg.manifest))
    expect(data.workspaceDir).toBe(path.resolve(await realpath(second)))
  })

  it('retains empty-directory and missing-directory discovery behavior', async () => {
    const empty = path.join(root, 'empty')
    const missing = path.join(root, 'missing')
    await mkdir(empty)
    for (const directory of [empty, missing]) {
      expect(await getWorkspacePackages(directory)).toEqual([])
      expect((await getWorkspaceData(directory)).packages).toEqual([])
    }
    expect((await getWorkspaceData(missing)).workspaceDir).toBe(missing)
  })

  it('retains an error for file paths instead of treating them as empty workspaces', async () => {
    const file = path.join(root, 'file')
    await writeFile(file, 'not a directory')
    await expect(getWorkspacePackages(file)).rejects.toMatchObject({ code: 'ENOTDIR' })
    await expect(getWorkspaceData(file)).rejects.toMatchObject({ code: 'ENOTDIR' })
    expect(await getWorkspacePackages(file, { patterns: ['packages/*'] })).toEqual([])
  })
})
