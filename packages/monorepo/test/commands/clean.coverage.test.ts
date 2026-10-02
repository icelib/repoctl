import { afterEach, describe, expect, it, vi } from 'vitest'

const resolveCommandConfigMock = vi.fn()
const getWorkspaceDataMock = vi.fn()
const clearWorkspaceCacheMock = vi.fn()
const checkboxMock = vi.fn()
const pathExistsMock = vi.fn()
const removeMock = vi.fn()
const readJsonMock = vi.fn()
const outputJsonMock = vi.fn()

vi.mock('@icebreakers/monorepo-templates', async () => {
  const actual = await vi.importActual<typeof import('@icebreakers/monorepo-templates')>('@icebreakers/monorepo-templates')
  return {
    ...actual,
    checkbox: checkboxMock,
  }
})

vi.mock('@/utils/fs', async () => {
  const actual = await vi.importActual<typeof import('@/utils/fs')>('@/utils/fs')
  return {
    ...actual,
    default: {
      ...actual.default,
      pathExists: pathExistsMock,
      remove: removeMock,
      readJson: readJsonMock,
      outputJson: outputJsonMock,
    },
    pathExists: pathExistsMock,
    remove: removeMock,
    readJson: readJsonMock,
    outputJson: outputJsonMock,
  }
})

vi.mock('@/core/config', () => ({
  resolveCommandConfig: resolveCommandConfigMock,
}))

vi.mock('@/core/workspace', () => ({
  getWorkspaceData: getWorkspaceDataMock,
  clearWorkspaceCache: clearWorkspaceCacheMock,
}))

afterEach(() => {
  resolveCommandConfigMock.mockReset()
  getWorkspaceDataMock.mockReset()
  clearWorkspaceCacheMock.mockReset()
  checkboxMock.mockReset()
  pathExistsMock.mockReset()
  removeMock.mockReset()
  readJsonMock.mockReset()
  outputJsonMock.mockReset()
})

describe('clean coverage', () => {
  it('covers interactive and auto confirm branches', async () => {
    const workspaceDir = '/repo'
    const rootPackageJson = { devDependencies: {} }

    resolveCommandConfigMock
      .mockResolvedValueOnce({
        ignorePackages: ['skip-me'],
        pinnedVersion: '1.2.3',
      })
      .mockResolvedValueOnce({
        autoConfirm: true,
        includePrivate: true,
      })
      .mockResolvedValueOnce({
        pinnedVersion: '2.0.0',
      })

    getWorkspaceDataMock
      .mockResolvedValueOnce({
        workspaceDir,
        packages: [
          {
            manifest: { name: 'skip-me' },
            rootDir: '/repo/packages/skip-me',
            rootDirRealPath: '/repo/packages/skip-me',
            pkgJsonPath: '/repo/packages/skip-me/package.json',
          },
          {
            manifest: { name: 'keep-me' },
            rootDir: '/repo/packages/keep-me',
            rootDirRealPath: '/repo/packages/keep-me',
            pkgJsonPath: '/repo/packages/keep-me/package.json',
          },
          {
            manifest: {},
            rootDir: '/repo/packages/unnamed',
            rootDirRealPath: '/repo/packages/unnamed',
            pkgJsonPath: '/repo/packages/unnamed/package.json',
          },
        ],
      })
      .mockResolvedValueOnce({
        workspaceDir,
        packages: [
          {
            manifest: { name: 'pkg-a' },
            rootDir: '/repo/packages/a',
            rootDirRealPath: '/repo/packages/a',
            pkgJsonPath: '/repo/packages/a/package.json',
          },
          {
            manifest: { name: 'pkg-b' },
            rootDir: '/repo/packages/b',
            rootDirRealPath: '/repo/packages/b',
            pkgJsonPath: '/repo/packages/b/package.json',
          },
        ],
      })
      .mockResolvedValueOnce({
        workspaceDir,
        packages: [
          {
            manifest: { name: 'pkg-a' },
            rootDir: '/repo/packages/a',
            rootDirRealPath: '/repo/packages/a',
            pkgJsonPath: '/repo/packages/a/package.json',
          },
        ],
      })

    checkboxMock.mockResolvedValue(['/repo/packages/keep-me'])
    pathExistsMock.mockResolvedValue(true)
    removeMock.mockResolvedValue(undefined)
    readJsonMock
      .mockResolvedValueOnce(rootPackageJson)
      .mockResolvedValueOnce({ devDependencies: {} })
      .mockResolvedValueOnce({ devDependencies: {} })
    outputJsonMock.mockResolvedValue(undefined)

    const { cleanProjects } = await import('@/commands/clean')

    await cleanProjects(workspaceDir)

    expect(getWorkspaceDataMock).toHaveBeenCalledWith(workspaceDir, { ignorePrivatePackage: false })
    expect(checkboxMock).toHaveBeenCalled()
    expect(removeMock).toHaveBeenCalledWith('/repo/packages/keep-me')
    expect(removeMock).toHaveBeenCalledWith('/repo/README.zh-CN.md')
    expect(removeMock).toHaveBeenCalledWith('/repo/.qoder')
    expect(removeMock).toHaveBeenCalledWith('/repo/docs/plans')
    expect(readJsonMock).toHaveBeenCalledWith('/repo/package.json')
    expect(outputJsonMock).toHaveBeenCalledWith('/repo/package.json', {
      devDependencies: {
        repoctl: '1.2.3',
      },
    }, { spaces: 2 })

    checkboxMock.mockClear()
    removeMock.mockClear()

    await cleanProjects(workspaceDir)

    expect(checkboxMock).not.toHaveBeenCalled()
    expect(removeMock).toHaveBeenCalledWith('/repo/packages/a')
    expect(outputJsonMock).toHaveBeenNthCalledWith(2, '/repo/package.json', {
      devDependencies: {
        repoctl: 'latest',
      },
    }, { spaces: 2 })

    checkboxMock.mockClear()
    removeMock.mockClear()

    await cleanProjects(workspaceDir, { autoConfirm: true, pinnedVersion: 'canary' })

    expect(checkboxMock).not.toHaveBeenCalled()
    expect(removeMock).toHaveBeenCalledWith('/repo/packages/a')
    expect(outputJsonMock).toHaveBeenNthCalledWith(3, '/repo/package.json', {
      devDependencies: {
        repoctl: 'canary',
      },
    }, { spaces: 2 })
    expect(clearWorkspaceCacheMock).toHaveBeenCalledTimes(3)
  })

  it('migrates legacy scoped helper dependency to repoctl', async () => {
    resolveCommandConfigMock.mockResolvedValue({
      autoConfirm: true,
      pinnedVersion: '3.0.0',
    })
    getWorkspaceDataMock.mockResolvedValue({
      workspaceDir: '/repo',
      packages: [],
    })
    pathExistsMock.mockResolvedValue(false)
    readJsonMock.mockResolvedValue({
      devDependencies: {
        '@icebreakers/monorepo': '^2.0.0',
      },
    })
    outputJsonMock.mockResolvedValue(undefined)

    const { cleanProjects } = await import('@/commands/clean')

    await cleanProjects('/repo')

    expect(outputJsonMock).toHaveBeenCalledWith('/repo/package.json', {
      devDependencies: {
        repoctl: '3.0.0',
      },
    }, { spaces: 2 })
    expect(clearWorkspaceCacheMock).toHaveBeenCalledTimes(1)
  })
})
