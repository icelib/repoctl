import type { ProjectManifest } from '@pnpm/types'
import type { Context } from '@/core/context'
import { tmpdir } from 'node:os'
import gitUrlParse from 'git-url-parse'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import setChangeset from '@/commands/init/setChangeset'
import setPkgJson from '@/commands/init/setPkgJson'
import setReadme from '@/commands/init/setReadme'
import fs from '@/utils/fs'

type WorkspacePackage = Context['packages'][number]
const packagesHeadingPattern = /## Packages/
const authorPattern = /Dev Example <dev@example.com>/

function createWorkspacePackage(manifest: ProjectManifest, dir: string): WorkspacePackage {
  return {
    manifest,
    rootDir: dir as WorkspacePackage['rootDir'],
    rootDirRealPath: dir as WorkspacePackage['rootDirRealPath'],
    pkgJsonPath: path.join(dir, 'package.json'),
    writeProjectManifest: vi.fn(async () => {}),
  }
}

afterEach(async () => {
  vi.resetAllMocks()
  await vi.resetModules()
})

describe('cleanProjects', () => {
  it('removes packages and resets devDependency', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-clean-'))
    const workspaceDir = path.join(tmpRoot, 'workspace')
    const packagesDir = path.join(workspaceDir, 'packages')
    const pkgFooDir = path.join(packagesDir, 'foo')
    const pkgBarDir = path.join(packagesDir, 'bar')
    const readmeZhPath = path.join(workspaceDir, 'README.zh-CN.md')
    const docsPlansDir = path.join(workspaceDir, 'docs/plans')

    await fs.ensureDir(pkgFooDir)
    await fs.ensureDir(pkgBarDir)
    await fs.ensureDir(docsPlansDir)
    await fs.writeFile(readmeZhPath, 'should be removed')
    await fs.writeFile(path.join(docsPlansDir, 'test-plan.md'), 'should be removed')
    await fs.writeJSON(path.join(workspaceDir, 'package.json'), {
      devDependencies: {
        '@icebreakers/monorepo': '^0.1.0',
      },
    }, { spaces: 2 })

    const packages: WorkspacePackage[] = [
      createWorkspacePackage({ name: 'foo' }, pkgFooDir),
      createWorkspacePackage({ name: 'bar' }, pkgBarDir),
    ]

    for (const pkg of packages) {
      await fs.writeJSON(pkg.pkgJsonPath, { name: pkg.manifest.name }, { spaces: 2 })
    }

    const checkboxMock = vi.fn(async () => packages.map(pkg => pkg.rootDir))
    await vi.resetModules()
    vi.doMock('@icebreakers/monorepo-templates', async () => {
      const actual = await vi.importActual<typeof import('@icebreakers/monorepo-templates')>('@icebreakers/monorepo-templates')
      return {
        ...actual,
        checkbox: checkboxMock,
      }
    })
    vi.doMock('@/core/workspace', () => ({
      getWorkspaceData: vi.fn(async () => ({ packages, workspaceDir })),
      clearWorkspaceCache: vi.fn(),
    }))
    vi.doMock('@/core/config', () => ({
      resolveCommandConfig: vi.fn(async () => ({})),
    }))

    const { cleanProjects } = await import('@/commands/clean')
    await cleanProjects(workspaceDir)

    expect(await fs.pathExists(pkgFooDir)).toBe(false)
    expect(await fs.pathExists(pkgBarDir)).toBe(false)
    expect(await fs.pathExists(readmeZhPath)).toBe(false)
    expect(await fs.pathExists(docsPlansDir)).toBe(false)

    const rootPkg = await fs.readJSON(path.join(workspaceDir, 'package.json'))
    expect(rootPkg.devDependencies.repoctl).toBe('latest')
    expect(rootPkg.devDependencies['@icebreakers/monorepo']).toBeUndefined()

    await fs.remove(tmpRoot)
  })
})

describe('init helpers', () => {
  it('updates metadata across workspace artifacts', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(tmpdir(), 'monorepo-init-'))
    const workspaceDir = path.join(tmpRoot, 'workspace')
    const packagesDir = path.join(workspaceDir, 'packages')
    const pkgAlphaDir = path.join(packagesDir, 'alpha')
    const pkgBetaDir = path.join(packagesDir, 'beta')

    await fs.ensureDir(pkgAlphaDir)
    await fs.ensureDir(pkgBetaDir)
    await fs.ensureDir(path.join(workspaceDir, '.changeset'))

    await fs.writeJSON(path.join(pkgAlphaDir, 'package.json'), {
      name: 'pkg-alpha',
      version: '0.0.0',
      description: 'Alpha package',
    }, { spaces: 2 })
    await fs.writeJSON(path.join(pkgBetaDir, 'package.json'), {
      name: 'pkg-beta',
      version: '0.0.0',
    }, { spaces: 2 })

    const workspaceFilepath = path.join(workspaceDir, 'pnpm-workspace.yaml')
    await fs.writeFile(workspaceFilepath, 'packages:\n  - packages/*\n')

    const packages: WorkspacePackage[] = [
      createWorkspacePackage(await fs.readJSON(path.join(pkgBetaDir, 'package.json')) as ProjectManifest, pkgBetaDir),
      createWorkspacePackage(await fs.readJSON(path.join(pkgAlphaDir, 'package.json')) as ProjectManifest, pkgAlphaDir),
    ]

    const ctx: Context = {
      cwd: workspaceDir,
      git: { getRepoRoot: async () => undefined } as Context['git'],
      gitUrl: gitUrlParse('https://github.com/ice/awesome.git'),
      gitUser: { name: 'Dev Example', email: 'dev@example.com' },
      packages,
      workspaceDir,
      workspaceFilepath,
      config: { commands: {} },
    }

    await setPkgJson(ctx)
    await setChangeset(ctx)
    await setReadme(ctx)

    const updatedAlpha = await fs.readJSON(path.join(pkgAlphaDir, 'package.json'))
    expect(updatedAlpha.author).toBe('Dev Example <dev@example.com>')
    expect(updatedAlpha.repository).toMatchObject({ directory: 'packages/alpha' })
    expect(updatedAlpha.bugs.url).toBe('https://github.com/ice/awesome/issues')

    expect(await fs.pathExists(path.join(workspaceDir, '.changeset'))).toBe(true)

    const readme = await fs.readFile(path.join(workspaceDir, 'README.md'), 'utf8')
    expect(readme).toMatch(packagesHeadingPattern)
    const alphaIndex = readme.indexOf('[pkg-alpha]')
    const betaIndex = readme.indexOf('[pkg-beta]')
    expect(alphaIndex).toBeLessThan(betaIndex)
    expect(readme).toMatch(authorPattern)

    await fs.remove(tmpRoot)
  })
})
