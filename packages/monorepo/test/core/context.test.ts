import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(async () => {
  await vi.resetModules()
  vi.resetAllMocks()
})

describe('createContext', () => {
  it('collects git metadata and workspace info', async () => {
    const fakePackages = [
      { manifest: { name: 'pkg-a' }, rootDir: '/repo/packages/a', pkgJsonPath: '/repo/packages/a/package.json' },
    ]
    class GitClientMock {
      async getGitUrl() {
        return { full_name: 'ice/awesome', name: 'awesome' }
      }

      async getUser() {
        return { name: 'Dev Example', email: 'dev@example.com' }
      }
    }

    await vi.resetModules()
    vi.doMock('@/core/workspace', () => ({
      getWorkspaceData: vi.fn(async () => ({ packages: fakePackages, workspaceDir: '/repo' })),
      clearWorkspaceCache: vi.fn(),
    }))
    vi.doMock('@/core/git', () => ({
      GitClient: GitClientMock,
    }))
    vi.doMock('@/core/config', () => ({
      loadMonorepoConfig: vi.fn(async () => ({})),
    }))

    const { createContext } = await import('@/core/context')
    const ctx = await createContext('/repo')

    expect(ctx.gitUrl?.full_name).toBe('ice/awesome')
    expect(ctx.gitUser?.email).toBe('dev@example.com')
    expect(ctx.packages).toBe(fakePackages)
    expect(ctx.workspaceFilepath.endsWith('pnpm-workspace.yaml')).toBe(true)
    expect(ctx.config).toEqual({})
  })
})

describe('init', () => {
  it('executes setup pipeline', async () => {
    const ctx = { cwd: '/repo', config: { commands: {} } }
    const createContextMock = vi.fn(async () => ctx)
    const setChangesetMock = vi.fn(async () => {})
    const setPkgJsonMock = vi.fn(async () => {})
    const setReadmeMock = vi.fn(async () => {})
    const pathExistsMock = vi.fn(async () => true)
    const readFileMock = vi.fn(async () => 'packages:\n  - apps/*\n  - packages/*\n  - examples/*\n')
    const writeFileMock = vi.fn(async () => {})

    await vi.resetModules()
    vi.doMock('@/core/context', () => ({ createContext: createContextMock }))
    vi.doMock('@/commands/init/setChangeset', () => ({ default: setChangesetMock }))
    vi.doMock('@/commands/init/setPkgJson', () => ({ default: setPkgJsonMock }))
    vi.doMock('@/commands/init/setReadme', () => ({ default: setReadmeMock }))
    vi.doMock('@/utils/fs', async () => {
      const actual = await vi.importActual<typeof import('@/utils/fs')>('@/utils/fs')
      return {
        ...actual,
        default: {
          ...actual.default,
          pathExists: pathExistsMock,
          readFile: readFileMock,
          writeFile: writeFileMock,
        },
      }
    })

    const { init } = await import('@/commands/init')
    await init('/repo')

    expect(createContextMock).toHaveBeenCalledWith('/repo')
    expect(setChangesetMock).toHaveBeenCalledWith(ctx)
    expect(setPkgJsonMock).toHaveBeenCalledWith(ctx)
    expect(setReadmeMock).toHaveBeenCalledWith(ctx, { force: false })
  })

  it('respects skip flags in init configuration', async () => {
    const ctx = { cwd: '/repo', config: { commands: { init: { skipChangeset: true, skipPkgJson: true, skipReadme: true } } } }
    const createContextMock = vi.fn(async () => ctx)
    const setChangesetMock = vi.fn(async () => {})
    const setPkgJsonMock = vi.fn(async () => {})
    const setReadmeMock = vi.fn(async () => {})
    const pathExistsMock = vi.fn(async () => true)
    const readFileMock = vi.fn(async () => 'packages:\n  - apps/*\n  - packages/*\n  - examples/*\n')
    const writeFileMock = vi.fn(async () => {})

    await vi.resetModules()
    vi.doMock('@/core/context', () => ({ createContext: createContextMock }))
    vi.doMock('@/commands/init/setChangeset', () => ({ default: setChangesetMock }))
    vi.doMock('@/commands/init/setPkgJson', () => ({ default: setPkgJsonMock }))
    vi.doMock('@/commands/init/setReadme', () => ({ default: setReadmeMock }))
    vi.doMock('@/utils/fs', async () => {
      const actual = await vi.importActual<typeof import('@/utils/fs')>('@/utils/fs')
      return {
        ...actual,
        default: {
          ...actual.default,
          pathExists: pathExistsMock,
          readFile: readFileMock,
          writeFile: writeFileMock,
        },
      }
    })

    const { init } = await import('@/commands/init')
    await init('/repo')

    expect(createContextMock).toHaveBeenCalledWith('/repo')
    expect(setChangesetMock).not.toHaveBeenCalled()
    expect(setPkgJsonMock).not.toHaveBeenCalled()
    expect(setReadmeMock).not.toHaveBeenCalled()
  })
})
