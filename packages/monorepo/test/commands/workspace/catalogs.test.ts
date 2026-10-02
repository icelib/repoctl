import { lstat, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createNewProject, getWorkspacePackages, init, initMetadata, resolveCreateNewProjectPlan, runDoctor } from '@icebreakers/monorepo'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from '@/utils/fs'

let root: string
const defaults = ['apps/*', 'packages/*', 'examples/*']

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-workspace-catalogs-'))
})

afterEach(async () => {
  await fs.remove(root)
})

async function snapshotWorkspace() {
  const files: Record<string, string> = {}
  async function visit(directory: string) {
    for (const entry of (await readdir(directory)).sort()) {
      const file = path.join(directory, entry)
      const relative = path.relative(root, file)
      const info = await lstat(file)
      if (info.isDirectory()) {
        files[`${relative}/`] = 'directory'
        await visit(file)
      }
      else {
        files[relative] = `${info.mode}:${(await readFile(file)).toString('base64')}`
      }
    }
  }
  await visit(root)
  return files
}

async function expectRejectedWithoutWrites() {
  const before = await snapshotWorkspace()
  await expect(readWorkspaceManifest(root)).rejects.toThrow()
  const report = await runDoctor(root)
  expect(report.checks).toContainEqual(expect.objectContaining({
    id: 'workspace-manifest',
    status: 'fail',
    detail: expect.stringContaining('Invalid pnpm-workspace.yaml'),
  }))
  expect(await snapshotWorkspace()).toEqual(before)

  const options = { cwd: root, name: 'services/new', type: 'tsdown' }
  for (const run of [
    () => resolveCreateNewProjectPlan(options),
    () => createNewProject(options),
    () => initMetadata(root),
    () => init(root, { preset: 'minimal', yes: true }),
  ]) {
    await expect(run()).rejects.toThrow('Invalid pnpm-workspace.yaml')
    expect(await snapshotWorkspace()).toEqual(before)
  }
}

describe('built workspace catalog validation before writes', () => {
  it.each([
    ['scalar catalog', 'catalog: custom\n'],
    ['boolean catalog', 'catalog: false\n'],
    ['array catalog', 'catalog: []\n'],
    ['numeric specifier', 'catalog: { vue: 3 }\n'],
    ['null specifier', 'catalog: { vue: null }\n'],
    ['scalar catalogs', 'catalogs: custom\n'],
    ['array catalogs', 'catalogs: []\n'],
    ['array named catalog', 'catalogs: { modern: [] }\n'],
    ['scalar named catalog', 'catalogs: { modern: false }\n'],
    ['null named catalog', 'catalogs: { modern: null }\n'],
    ['numeric named specifier', 'catalogs: { modern: { vue: 3 } }\n'],
  ])('rejects %s without creating a root package or modifying any file', async (_name, catalog) => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), `packages: [modules/*]\n${catalog}`)
    await fs.outputFile(path.join(root, 'user/notes.txt'), 'keep user content\n')

    await expectRejectedWithoutWrites()

    expect(await fs.pathExists(path.join(root, 'package.json'))).toBe(false)
  })

  it.each(['packages: [apps/*, packages/*, examples/*]\n', ''])('validates catalogs even when init needs no pattern additions: %j', async (patterns) => {
    await fs.writeJson(path.join(root, 'package.json'), { name: 'existing-root', private: true, scripts: { custom: 'echo keep' } })
    await fs.writeFile(path.join(root, 'README.md'), '# User documentation\n')
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), `${patterns}catalogs: { modern: null }\n`)

    await expectRejectedWithoutWrites()
  })

  it('rejects an empty package rule that pnpm does not accept', async () => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [""]\ncatalog: {}\n')

    await expectRejectedWithoutWrites()
  })

  it.each([
    ['packages: false\n', 'packages must be an array of strings'],
    ['packages: ["["]\n', 'Invalid pnpm workspace pattern'],
  ])('retains existing package rule errors before catalog validation: %s', async (patterns, expectedError) => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), `${patterns}catalogs: { modern: null }\n`)
    const before = await snapshotWorkspace()
    const options = { cwd: root, name: 'services/new', type: 'tsdown' }

    await expect(initMetadata(root)).rejects.toThrow(expectedError)
    await expect(resolveCreateNewProjectPlan(options)).rejects.toThrow(expectedError)
    const report = await runDoctor(root)
    expect(report.checks).toContainEqual(expect.objectContaining({
      id: 'workspace-manifest',
      status: 'fail',
      detail: expect.stringContaining(expectedError),
    }))
    expect(await snapshotWorkspace()).toEqual(before)
  })

  it.each([
    ['absent catalogs', ''],
    ['null top-level catalogs', 'catalog: null\ncatalogs: null\n'],
    ['empty mappings', 'catalog: {}\ncatalogs: { modern: {} }\n'],
    ['aliases', 'catalog: &shared { vue: "^3" } # user catalog\ncatalogs: { modern: *shared }\n'],
    ['empty specifiers', 'catalog: { vue: "" }\ncatalogs: { modern: { vite: "" } }\n'],
  ])('retains pnpm-supported %s through preview, initialization and creation', async (_name, catalogs) => {
    await fs.writeJson(path.join(root, 'package.json'), { name: 'root', private: true })
    await fs.outputJson(path.join(root, 'modules/api/package.json'), { name: 'api', version: '1.0.0' })
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, `# Workspace rules\npackages: [modules/*]\n${catalogs}`)
    const expected = await readWorkspaceManifest(root)
    const before = await snapshotWorkspace()
    const options = { cwd: root, name: 'services/new', type: 'tsdown' }

    expect((await resolveCreateNewProjectPlan(options)).workspaceManifest.changed).toBe(true)
    expect(await snapshotWorkspace()).toEqual(before)
    const report = await runDoctor(root)
    expect(report.packageCount).toBe(1)
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'workspace-manifest', status: 'pass' }))
    expect(await snapshotWorkspace()).toEqual(before)

    await initMetadata(root)
    expect(await readWorkspaceManifest(root)).toEqual({ ...expected, packages: ['modules/*', ...defaults] })
    const initialized = await snapshotWorkspace()
    await initMetadata(root)
    expect(await snapshotWorkspace()).toEqual(initialized)

    await createNewProject(options)
    expect(await readWorkspaceManifest(root)).toEqual({ ...expected, packages: ['modules/*', ...defaults, 'services/new'] })
    expect((await getWorkspacePackages(root, { ignorePrivatePackage: false })).map(pkg => pkg.manifest.name).sort()).toEqual(['api', 'new'])
    const content = await fs.readFile(manifestPath, 'utf8')
    expect(content).toContain('# Workspace rules')
    if (catalogs.includes('&shared')) {
      expect(content).toContain('&shared')
      expect(content).toContain('*shared')
      expect(content).toContain('# user catalog')
    }
    const created = await snapshotWorkspace()
    expect((await resolveCreateNewProjectPlan(options)).workspaceManifest.changed).toBe(false)
    expect(await snapshotWorkspace()).toEqual(created)
  })

  it('can initialize and create after the user repairs an invalid catalog', async () => {
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, 'packages: [modules/*]\ncatalogs: { modern: null }\n')
    await expectRejectedWithoutWrites()
    await fs.writeFile(manifestPath, 'packages: [modules/*]\ncatalogs: { modern: { vue: "^3" } }\n')

    await init(root, { tooling: [] })
    await createNewProject({ cwd: root, name: 'services/new', type: 'tsdown' })

    expect(await readWorkspaceManifest(root)).toMatchObject({ catalogs: { modern: { vue: '^3' } } })
    const report = await runDoctor(root)
    expect(report.packageCount).toBe(1)
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'workspace-manifest', status: 'pass' }))
  })
})
