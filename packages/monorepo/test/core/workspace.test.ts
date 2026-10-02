import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(async () => {
  await vi.resetModules()
  vi.resetAllMocks()
})

describe('workspace helpers', () => {
  it('filters out root and private packages by default', async () => {
    const findWorkspacePackagesMock = vi.fn(async () => [
      { rootDir: '/repo', manifest: { name: 'root', private: false }, rootDirRealPath: '/repo' },
      { rootDir: '/repo/packages/a', manifest: { name: 'pkg-a', private: false }, rootDirRealPath: '/repo/packages/a' },
      { rootDir: '/repo/packages/b', manifest: { name: 'pkg-b', private: true }, rootDirRealPath: '/repo/packages/b' },
    ])
    const readManifestMock = vi.fn(async () => ({ packages: ['packages/*'] }))

    vi.doMock('@pnpm/workspace.find-packages', () => ({ findWorkspacePackages: findWorkspacePackagesMock }))
    vi.doMock('@pnpm/workspace.read-manifest', () => ({ readWorkspaceManifest: readManifestMock }))
    vi.doMock('@pnpm/find-workspace-dir', () => ({ findWorkspaceDir: vi.fn(async () => '/repo') }))

    const { getWorkspacePackages } = await import('@/core/workspace')
    const result = await getWorkspacePackages('/repo')

    expect(result.map(pkg => pkg.manifest.name)).toEqual(['pkg-a'])
    expect(result[0]?.pkgJsonPath).toBe('/repo/packages/a/package.json')
    expect(readManifestMock).toHaveBeenCalledWith('/repo')
    expect(findWorkspacePackagesMock).toHaveBeenCalledWith('/repo', { patterns: ['packages/*'] })
  })

  it('filters out the root package when pnpm reports a short root path', async () => {
    const findWorkspacePackagesMock = vi.fn(async () => [
      { rootDir: '/RUNNER~1/repo', manifest: { name: 'root', private: false }, rootDirRealPath: '/runneradmin/repo' },
      { rootDir: '/runneradmin/repo/packages/a', manifest: { name: 'pkg-a', private: false }, rootDirRealPath: '/runneradmin/repo/packages/a' },
    ])
    const readManifestMock = vi.fn(async () => ({ packages: ['packages/*'] }))

    vi.doMock('@pnpm/workspace.find-packages', () => ({ findWorkspacePackages: findWorkspacePackagesMock }))
    vi.doMock('@pnpm/workspace.read-manifest', () => ({ readWorkspaceManifest: readManifestMock }))
    vi.doMock('@pnpm/find-workspace-dir', () => ({ findWorkspaceDir: vi.fn(async () => '/runneradmin/repo') }))

    const { getWorkspacePackages } = await import('@/core/workspace')
    const result = await getWorkspacePackages('/runneradmin/repo', { ignorePrivatePackage: false })

    expect(result.map(pkg => pkg.manifest.name)).toEqual(['pkg-a'])
    expect(result[0]?.rootDir).toBe('/runneradmin/repo/packages/a')
  })

  it('keeps root and private packages when options request them', async () => {
    const findWorkspacePackagesMock = vi.fn(async () => [
      { rootDir: '/repo', manifest: { name: 'root', private: false }, rootDirRealPath: '/repo' },
      { rootDir: '/repo/apps/site', manifest: { name: 'site', private: true }, rootDirRealPath: '/repo/apps/site' },
    ])

    vi.doMock('@pnpm/workspace.find-packages', () => ({ findWorkspacePackages: findWorkspacePackagesMock }))
    vi.doMock('@pnpm/workspace.read-manifest', () => ({ readWorkspaceManifest: vi.fn(async () => null) }))
    vi.doMock('@pnpm/find-workspace-dir', () => ({ findWorkspaceDir: vi.fn(async () => '/repo') }))

    const { getWorkspacePackages } = await import('@/core/workspace')
    const result = await getWorkspacePackages('/repo', {
      ignoreRootPackage: false,
      ignorePrivatePackage: false,
      patterns: ['apps/*'],
    })

    expect(findWorkspacePackagesMock).toHaveBeenCalledWith('/repo', { patterns: ['apps/*'] })
    expect(result.map(pkg => pkg.manifest.name)).toEqual(['root', 'site'])
  })

  it('returns sorted workspace package summaries for CLI and JSON consumers', async () => {
    const findWorkspacePackagesMock = vi.fn(async () => [
      { rootDir: '/repo/packages/b', manifest: { name: 'pkg-b', private: true }, rootDirRealPath: '/repo/packages/b' },
      { rootDir: '/repo/packages/a', manifest: { name: 'pkg-a', description: 'Alpha', private: false }, rootDirRealPath: '/repo/packages/a' },
    ])

    vi.doMock('@pnpm/workspace.find-packages', () => ({ findWorkspacePackages: findWorkspacePackagesMock }))
    vi.doMock('@pnpm/workspace.read-manifest', () => ({ readWorkspaceManifest: vi.fn(async () => ({ packages: ['packages/*'] })) }))
    vi.doMock('@pnpm/find-workspace-dir', () => ({ findWorkspaceDir: vi.fn(async () => '/repo') }))

    const { getWorkspacePackageSummaries } = await import('@/core/workspace')
    const result = await getWorkspacePackageSummaries('/repo', { ignorePrivatePackage: false })

    expect(result.workspaceDir).toBe('/repo')
    expect(result.packages).toEqual([
      {
        name: 'pkg-a',
        description: 'Alpha',
        private: false,
        rootDir: '/repo/packages/a',
        relativeDir: 'packages/a',
        pkgJsonPath: '/repo/packages/a/package.json',
      },
      {
        name: 'pkg-b',
        private: true,
        rootDir: '/repo/packages/b',
        relativeDir: 'packages/b',
        pkgJsonPath: '/repo/packages/b/package.json',
      },
    ])
  })

  it('falls back to cwd when workspace directory is not found', async () => {
    const findWorkspacePackagesMock = vi.fn(async () => [])

    vi.doMock('@pnpm/find-workspace-dir', () => ({ findWorkspaceDir: vi.fn(async () => undefined) }))
    vi.doMock('@pnpm/workspace.find-packages', () => ({ findWorkspacePackages: findWorkspacePackagesMock }))
    vi.doMock('@pnpm/workspace.read-manifest', () => ({ readWorkspaceManifest: vi.fn(async () => null) }))

    const { getWorkspaceData } = await import('@/core/workspace')
    const data = await getWorkspaceData('/repo/sub')

    expect(data.workspaceDir).toBe('/repo/sub')
    expect(findWorkspacePackagesMock).toHaveBeenCalledWith('/repo/sub', {})
    expect(data.packages).toEqual([])
  })

  it('reuses workspace manifest, package and directory lookups in the same process', async () => {
    const findWorkspacePackagesMock = vi.fn(async () => [
      { rootDir: '/repo/packages/a', manifest: { name: 'pkg-a', private: false }, rootDirRealPath: '/repo/packages/a' },
    ])
    const readManifestMock = vi.fn(async () => ({ packages: ['packages/*'] }))
    const findWorkspaceDirMock = vi.fn(async () => '/repo')

    vi.doMock('@pnpm/workspace.find-packages', () => ({ findWorkspacePackages: findWorkspacePackagesMock }))
    vi.doMock('@pnpm/workspace.read-manifest', () => ({ readWorkspaceManifest: readManifestMock }))
    vi.doMock('@pnpm/find-workspace-dir', () => ({ findWorkspaceDir: findWorkspaceDirMock }))

    const { clearWorkspaceCache, getWorkspaceData, getWorkspacePackages } = await import('@/core/workspace')

    await getWorkspacePackages('/repo')
    await getWorkspacePackages('/repo')
    await getWorkspaceData('/repo/packages/a')
    await getWorkspaceData('/repo/packages/a')

    expect(readManifestMock).toHaveBeenCalledTimes(1)
    expect(findWorkspacePackagesMock).toHaveBeenCalledTimes(1)
    expect(findWorkspaceDirMock).toHaveBeenCalledTimes(1)

    clearWorkspaceCache()
    await getWorkspacePackages('/repo')
    expect(readManifestMock).toHaveBeenCalledTimes(2)
    expect(findWorkspacePackagesMock).toHaveBeenCalledTimes(2)
  })

  it('detaches returned manifests from the cached package objects', async () => {
    const findWorkspacePackagesMock = vi.fn(async () => [
      {
        rootDir: '/repo/packages/a',
        manifest: {
          name: 'pkg-a',
          private: false,
          custom: { nested: true },
        },
        rootDirRealPath: '/repo/packages/a',
      },
    ])

    vi.doMock('@pnpm/workspace.find-packages', () => ({ findWorkspacePackages: findWorkspacePackagesMock }))
    vi.doMock('@pnpm/workspace.read-manifest', () => ({ readWorkspaceManifest: vi.fn(async () => ({ packages: ['packages/*'] })) }))
    vi.doMock('@pnpm/find-workspace-dir', () => ({ findWorkspaceDir: vi.fn(async () => '/repo') }))

    const { getWorkspacePackages } = await import('@/core/workspace')
    const first = await getWorkspacePackages('/repo')
    const firstManifest = first[0]!.manifest as typeof first[0]['manifest'] & { custom: { nested: boolean } }
    firstManifest.name = 'mutated'
    firstManifest.custom.nested = false

    const second = await getWorkspacePackages('/repo')
    const secondManifest = second[0]!.manifest as typeof second[0]['manifest'] & { custom: { nested: boolean } }
    expect(secondManifest.name).toBe('pkg-a')
    expect(secondManifest.custom.nested).toBe(true)
    expect(findWorkspacePackagesMock).toHaveBeenCalledTimes(1)
  })

  it('evicts rejected discovery promises so repaired manifests can be retried', async () => {
    const findWorkspacePackagesMock = vi.fn(async () => [
      { rootDir: '/repo/packages/a', manifest: { name: 'pkg-a', private: false }, rootDirRealPath: '/repo/packages/a' },
    ])
    const readManifestMock = vi.fn()
      .mockRejectedValueOnce(new Error('invalid workspace manifest'))
      .mockResolvedValue({ packages: ['packages/*'] })

    vi.doMock('@pnpm/workspace.find-packages', () => ({ findWorkspacePackages: findWorkspacePackagesMock }))
    vi.doMock('@pnpm/workspace.read-manifest', () => ({ readWorkspaceManifest: readManifestMock }))
    vi.doMock('@pnpm/find-workspace-dir', () => ({ findWorkspaceDir: vi.fn(async () => '/repo') }))

    const { getWorkspacePackages } = await import('@/core/workspace')
    await expect(getWorkspacePackages('/repo')).rejects.toThrow('invalid workspace manifest')
    const result = await getWorkspacePackages('/repo')

    expect(result.map(pkg => pkg.manifest.name)).toEqual(['pkg-a'])
    expect(readManifestMock).toHaveBeenCalledTimes(2)
    expect(findWorkspacePackagesMock).toHaveBeenCalledTimes(1)
  })

  it('evicts rejected package discovery promises without clearing a newer result', async () => {
    const findWorkspacePackagesMock = vi.fn()
      .mockRejectedValueOnce(new Error('temporary package scan failure'))
      .mockResolvedValue([{ rootDir: '/repo/packages/a', manifest: { name: 'pkg-a', private: false }, rootDirRealPath: '/repo/packages/a' }])

    vi.doMock('@pnpm/workspace.find-packages', () => ({ findWorkspacePackages: findWorkspacePackagesMock }))
    vi.doMock('@pnpm/workspace.read-manifest', () => ({ readWorkspaceManifest: vi.fn(async () => ({ packages: ['packages/*'] })) }))
    vi.doMock('@pnpm/find-workspace-dir', () => ({ findWorkspaceDir: vi.fn(async () => '/repo') }))

    const { getWorkspacePackages } = await import('@/core/workspace')
    await expect(getWorkspacePackages('/repo', { patterns: ['packages/*'] })).rejects.toThrow('temporary package scan failure')
    const result = await getWorkspacePackages('/repo', { patterns: ['packages/*'] })

    expect(result.map(pkg => pkg.manifest.name)).toEqual(['pkg-a'])
    expect(findWorkspacePackagesMock).toHaveBeenCalledTimes(2)
  })
})
