import type { ProjectManifest } from '@pnpm/types'
import type { Context } from '@/core/context'
import gitUrlParse from 'git-url-parse'
import { afterEach, describe, expect, it, vi } from 'vitest'

const files = new Map<string, string>()

const existsMock = vi.fn(async (file: string) => files.has(file))
const pathExistsMock = vi.fn(async (file: string) => files.has(file))
const readJsonMock = vi.fn(async (file: string) => JSON.parse(files.get(file) ?? 'null'))
const outputJsonMock = vi.fn(async (file: string, data: unknown, options?: { spaces?: number }) => {
  const spaces = options?.spaces ?? 0
  files.set(file, `${JSON.stringify(data, undefined, spaces)}${spaces ? '\n' : ''}`)
})
const readFileMock = vi.fn(async (file: string) => files.get(file) ?? '')
const writeFileMock = vi.fn(async (file: string, content: string) => {
  files.set(file, content)
})

type WorkspacePackage = Context['packages'][number]

function createWorkspacePackage(manifest: ProjectManifest, dir: string): WorkspacePackage {
  return {
    manifest,
    rootDir: dir as WorkspacePackage['rootDir'],
    rootDirRealPath: dir as WorkspacePackage['rootDirRealPath'],
    pkgJsonPath: `${dir}/package.json`,
    writeProjectManifest: vi.fn(async () => {}),
  }
}

function createTestContext(overrides: Partial<Context> = {}): Context {
  const workspaceDir = overrides.workspaceDir ?? '/repo'
  const workspaceFilepath = overrides.workspaceFilepath ?? `${workspaceDir}/pnpm-workspace.yaml`
  return {
    cwd: overrides.cwd ?? workspaceDir,
    git: overrides.git ?? ({} as Context['git']),
    gitUrl: overrides.gitUrl ?? gitUrlParse('https://github.com/ice/awesome.git'),
    gitUser: overrides.gitUser ?? { name: 'Dev Example', email: 'dev@example.com' },
    workspaceDir,
    workspaceFilepath,
    packages: (overrides.packages ?? []) as Context['packages'],
    config: overrides.config ?? { commands: {} },
  }
}

vi.mock('@/utils/fs', async () => {
  const actual = await vi.importActual<typeof import('@/utils/fs')>('@/utils/fs')
  return {
    ...actual,
    default: {
      ...actual.default,
      exists: existsMock,
      pathExists: pathExistsMock,
      readJson: readJsonMock,
      outputJson: outputJsonMock,
      readFile: readFileMock,
      writeFile: writeFileMock,
    },
    exists: existsMock,
    pathExists: pathExistsMock,
    readJson: readJsonMock,
    outputJson: outputJsonMock,
    readFile: readFileMock,
    writeFile: writeFileMock,
  }
})

afterEach(() => {
  files.clear()
  existsMock.mockReset()
  pathExistsMock.mockReset()
  readJsonMock.mockReset()
  outputJsonMock.mockReset()
  readFileMock.mockReset()
  writeFileMock.mockReset()
})

describe('init helpers coverage', () => {
  it('initializes pnpm change intents, package manifests and readme content', async () => {
    const workspaceDir = '/repo'
    const workspaceFilepath = `${workspaceDir}/pnpm-workspace.yaml`
    files.set(workspaceFilepath, '')
    files.set(`${workspaceDir}/.github/ISSUE_TEMPLATE/config.yml`, [
      'blank_issues_enabled: false',
      'contact_links:',
      '  - name: Feature Request',
      '    url: https://github.com/icelib/repoctl/discussions',
      '    about: Suggest new features for consideration',
      '',
    ].join('\n'))
    files.set(`${workspaceDir}/packages/a/package.json`, JSON.stringify({ name: 'pkg-a', version: '0.0.0', description: 'Alpha' }))
    files.set(`${workspaceDir}/packages/root/package.json`, JSON.stringify({ name: 'root-app', version: '0.0.0', private: false }))

    const ctx = createTestContext({
      cwd: workspaceDir,
      workspaceDir,
      workspaceFilepath,
      packages: [
        createWorkspacePackage({ name: 'pkg-a', version: '0.0.0', description: 'Alpha' }, `${workspaceDir}/packages/a`),
        createWorkspacePackage({ name: 'root-app', version: '0.0.0' }, `${workspaceDir}/packages/root`),
      ],
    })

    const [setChangeset, setPkgJson, setReadme, setIssueTemplateConfig] = await Promise.all([
      import('@/commands/init/setChangeset').then(mod => mod.default),
      import('@/commands/init/setPkgJson').then(mod => mod.default),
      import('@/commands/init/setReadme').then(mod => mod.default),
      import('@/commands/init/setIssueTemplateConfig').then(mod => mod.default),
    ])

    await setChangeset(ctx)
    expect(outputJsonMock).not.toHaveBeenCalled()

    const gitUrlWithoutRepo = { ...(ctx.gitUrl ?? gitUrlParse('https://github.com/ice/awesome.git')), full_name: '' }
    await setChangeset({ ...ctx, gitUrl: gitUrlWithoutRepo })
    expect(outputJsonMock).not.toHaveBeenCalled()

    await setPkgJson(ctx)
    const pkgA = JSON.parse(files.get(`${workspaceDir}/packages/a/package.json`) ?? '{}')
    expect(pkgA.author).toBe('Dev Example <dev@example.com>')
    expect(pkgA.repository.directory).toBe('packages/a')

    await setPkgJson({ ...ctx, gitUser: { name: 'Dev Example', email: '' } })
    expect(files.get(`${workspaceDir}/packages/root/package.json`)).toContain('"repository":')

    await setReadme(ctx)
    expect(files.get(`${workspaceDir}/README.md`)).toContain('Contributions Welcome!')

    await setReadme({ ...ctx, gitUrl: undefined }, { force: true })
    const readme = files.get(`${workspaceDir}/README.md`) ?? ''
    expect(readme).not.toContain('Contributions Welcome!')

    await setIssueTemplateConfig(ctx)
    const issueTemplate = files.get(`${workspaceDir}/.github/ISSUE_TEMPLATE/config.yml`) ?? ''
    expect(issueTemplate).toContain('https://github.com/ice/awesome/discussions')
    await setIssueTemplateConfig({ ...ctx, gitUrl: undefined })
    expect(files.get(`${workspaceDir}/.github/ISSUE_TEMPLATE/config.yml`)).toBe(issueTemplate)
  })

  it('invokes init pipeline respecting skip flags', async () => {
    const createContextMock = vi.fn(async () => ({
      cwd: '/repo',
      config: {
        commands: {
          init: {},
        },
      },
    }))
    const setChangesetMock = vi.fn(async () => {})
    const setPkgJsonMock = vi.fn(async () => {})
    const setIssueTemplateConfigMock = vi.fn(async () => {})
    const setReadmeMock = vi.fn(async () => {})
    const initToolingMock = vi.fn(async () => ({
      selectedTargets: [],
      writtenFiles: [],
      skippedFiles: [],
      updatedPackageJson: false,
    }))

    await vi.resetModules()
    vi.doMock('@/core/context', () => ({ createContext: createContextMock }))
    vi.doMock('@/commands/init/setChangeset', () => ({ default: setChangesetMock }))
    vi.doMock('@/commands/init/setPkgJson', () => ({ default: setPkgJsonMock }))
    vi.doMock('@/commands/init/setIssueTemplateConfig', () => ({ default: setIssueTemplateConfigMock }))
    vi.doMock('@/commands/init/setReadme', () => ({ default: setReadmeMock }))
    vi.doMock('@/commands/init/tooling', () => ({
      initTooling: initToolingMock,
      initToolingTargets: ['commitlint', 'eslint', 'stylelint', 'lint-staged', 'tsconfig', 'vitest'],
      normalizeInitToolingTargets: (input: string[]) => input,
    }))
    vi.doMock('@/commands/init/tooling/types', () => ({
      initToolingTargets: ['eslint', 'vitest'],
    }))

    const { init } = await import('@/commands/init')
    await init('/repo')
    expect(setChangesetMock).toHaveBeenCalled()
    expect(setPkgJsonMock).toHaveBeenCalled()
    expect(setIssueTemplateConfigMock).toHaveBeenCalled()
    expect(setReadmeMock).toHaveBeenCalled()
    expect(initToolingMock).toHaveBeenCalledWith('/repo', {
      targets: [],
      force: false,
    })
    expect(setReadmeMock).toHaveBeenCalledWith(expect.anything(), { force: false })

    initToolingMock.mockClear()
    await init('/repo', { preset: 'minimal' })
    expect(initToolingMock).toHaveBeenCalledWith('/repo', {
      targets: ['tsconfig'],
      force: false,
    })

    setChangesetMock.mockClear()
    setPkgJsonMock.mockClear()
    setIssueTemplateConfigMock.mockClear()
    setReadmeMock.mockClear()
    initToolingMock.mockClear()
    createContextMock.mockResolvedValueOnce({
      cwd: '/repo',
      config: {
        commands: {
          init: {
            skipChangeset: true,
            skipPkgJson: true,
            skipIssueTemplateConfig: true,
            skipReadme: true,
            tooling: ['eslint'],
            preset: 'standard',
            force: true,
          },
        },
      },
    })

    await init('/repo', { tooling: ['vitest'] })
    expect(setChangesetMock).not.toHaveBeenCalled()
    expect(setPkgJsonMock).not.toHaveBeenCalled()
    expect(setIssueTemplateConfigMock).not.toHaveBeenCalled()
    expect(setReadmeMock).not.toHaveBeenCalled()
    expect(initToolingMock).toHaveBeenCalledWith('/repo', {
      targets: ['vitest'],
      force: true,
    })

    initToolingMock.mockClear()
    createContextMock.mockResolvedValueOnce({
      cwd: '/repo',
      config: {
        commands: {
          init: {
            skipChangeset: true,
            skipPkgJson: true,
            skipIssueTemplateConfig: true,
            skipReadme: true,
            tooling: ['eslint'],
            preset: 'standard',
            force: true,
          },
        },
      },
    })
    await init('/repo')
    expect(initToolingMock).toHaveBeenCalledWith('/repo', {
      targets: ['commitlint', 'eslint', 'stylelint', 'lint-staged', 'tsconfig', 'vitest'],
      force: true,
    })
  })

  it('creates missing root files and preserves existing workspace/readme by default', async () => {
    const workspaceDir = '/repo'
    files.set(`${workspaceDir}/README.md`, '# User README\n')
    files.set(`${workspaceDir}/package.json`, JSON.stringify({
      name: 'demo',
      private: true,
      scripts: {
        build: 'turbo build',
      },
    }))
    files.set(`${workspaceDir}/pnpm-workspace.yaml`, 'packages:\n  - custom/*\n')

    const ctx = createTestContext({
      cwd: workspaceDir,
      workspaceDir,
      workspaceFilepath: `${workspaceDir}/pnpm-workspace.yaml`,
      gitUrl: undefined,
      packages: [],
    })

    await vi.resetModules()
    vi.doMock('@/core/context', () => ({ createContext: vi.fn(async () => ctx) }))
    vi.doMock('@/commands/init/tooling', () => ({
      initTooling: vi.fn(async () => ({
        selectedTargets: [],
        writtenFiles: [],
        skippedFiles: [],
        updatedPackageJson: false,
      })),
      initToolingTargets: [],
      normalizeInitToolingTargets: (input: string[]) => input,
    }))

    const { init } = await import('@/commands/init')
    await init(workspaceDir, { yes: true })
    await init(workspaceDir, { yes: true })

    expect(files.get(`${workspaceDir}/README.md`)).toBe('# User README\n')
    const workspaceManifest = files.get(`${workspaceDir}/pnpm-workspace.yaml`) ?? ''
    expect(workspaceManifest).toContain('custom/*')
    expect(workspaceManifest).toContain('apps/*')
    expect(workspaceManifest).toContain('packages/*')
    expect(workspaceManifest).toContain('examples/*')
  })
})
