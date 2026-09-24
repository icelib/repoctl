import type { TemplateDefinition } from '@icebreakers/monorepo-templates'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TemplateMapSubset {
  custom: TemplateDefinition
  tsdown: TemplateDefinition
}

interface PackageBugs {
  url?: string
}

interface PackageRepo {
  type?: string
  url?: string
  directory?: string
}

interface OutputPackageJson {
  name?: string
  author?: string
  bugs?: PackageBugs
  homepage?: string
  repository?: PackageRepo
}

const ensureDirMock = vi.fn(async () => {})
const readJsonMock = vi.fn(async () => ({ name: 'template', version: '1.0.0' }))
const outputJsonMock = vi.fn<(file: string, data: unknown, options?: { spaces?: number }) => Promise<void>>(async () => {})
const outputFileMock = vi.fn(async () => {})
const pathExistsMock = vi.fn<(targetPath: string) => Promise<boolean>>(async (_targetPath: string) => false)
const scaffoldTemplateMock = vi.fn(async () => {})
const resolveCommandConfigMock = vi.fn(async () => ({}))
const successMock = vi.fn()
const getRepoNameMock = vi.fn(async () => 'ice/awesome')
const getUserMock = vi.fn(async () => ({ name: 'Dev Example', email: 'dev@example.com' }))
const getRepoRootMock = vi.fn(async () => '/repo')

beforeEach(async () => {
  await vi.resetModules()
  ensureDirMock.mockClear()
  readJsonMock.mockReset()
  outputJsonMock.mockClear()
  outputFileMock.mockClear()
  pathExistsMock.mockReset()
  scaffoldTemplateMock.mockClear()
  resolveCommandConfigMock.mockReset()
  successMock.mockClear()
  getRepoNameMock.mockClear()
  getUserMock.mockClear()
  getRepoRootMock.mockClear()

  readJsonMock.mockResolvedValue({ name: 'template', version: '1.0.0' })
  pathExistsMock.mockImplementation(async (targetPath: string) => targetPath.endsWith('package.json'))
  getRepoNameMock.mockResolvedValue('ice/awesome')
  getUserMock.mockResolvedValue({ name: 'Dev Example', email: 'dev@example.com' })
  getRepoRootMock.mockResolvedValue('/repo')

  vi.doMock('@/utils/fs', async () => {
    const actual = await vi.importActual<typeof import('@/utils/fs')>('@/utils/fs')
    return {
      ...actual,
      default: {
        ...actual.default,
        ensureDir: ensureDirMock,
        readJson: readJsonMock,
        outputJson: outputJsonMock,
        outputFile: outputFileMock,
        pathExists: pathExistsMock,
      },
      ensureDir: ensureDirMock,
      readJson: readJsonMock,
      outputJson: outputJsonMock,
      outputFile: outputFileMock,
      pathExists: pathExistsMock,
    }
  })

  vi.doMock('@/core/config', () => ({
    resolveCommandConfig: resolveCommandConfigMock,
  }))

  vi.doMock('@/core/logger', () => ({
    logger: {
      success: successMock,
      info: vi.fn(),
      error: vi.fn(),
    },
  }))

  vi.doMock('@/core/git', () => ({
    GitClient: class {
      getRepoName() {
        return getRepoNameMock()
      }

      getUser() {
        return getUserMock()
      }

      getRepoRoot() {
        return getRepoRootMock()
      }
    },
  }))

  vi.doMock('@icebreakers/monorepo-templates', () => ({
    scaffoldTemplate: scaffoldTemplateMock,
    suggestTemplateKey: vi.fn((key: string) => key === 'unknown-template' ? undefined : 'tsdown'),
    templateChoices: [
      { key: 'tsdown', label: 'tsdown 打包', source: 'tsdown', target: 'packages/tsdown', description: 'TypeScript library' },
      { key: 'vue-lib', label: 'vue 组件', source: 'vue-lib', target: 'packages/vue-lib' },
      { key: 'vue-hono', label: 'vue hono 全栈', source: 'client', target: 'apps/client' },
      { key: 'hono-server', label: 'hono 模板', source: 'server', target: 'apps/server' },
      { key: 'vitepress', label: 'vitepress 文档', source: 'vitepress', target: 'apps/website' },
      { key: 'cli', label: 'cli 模板', source: 'cli', target: 'apps/cli' },
    ],
  }))
})

describe('createNewProject unit scenarios', () => {
  it('getCreateChoices returns defaults when override omitted', async () => {
    const { getCreateChoices } = await import('@/commands/create')
    const defaults = getCreateChoices()
    expect(defaults).toHaveLength(6)
    expect(defaults.some(choice => choice.value === 'tsdown')).toBe(true)
    const customChoices = [{ name: 'custom', value: 'custom' }]
    expect(getCreateChoices(customChoices)).toBe(customChoices)
  })

  it('getTemplateMap merges extra entries', async () => {
    const { getTemplateMap } = await import('@/commands/create')
    const merged = getTemplateMap({ custom: 'custom-template' }) as unknown as TemplateMapSubset
    expect(merged.custom).toEqual({ source: 'custom-template', target: 'custom-template' })
    expect(merged.tsdown).toEqual({ source: 'tsdown', target: 'packages/tsdown' })
  })

  it('throws when target directory already exists', async () => {
    pathExistsMock.mockImplementation(async (targetPath: string) => targetPath === '/repo/demo' || targetPath.endsWith('package.json'))
    const { createNewProject } = await import('@/commands/create')

    await expect(createNewProject({ cwd: '/repo', name: 'demo' })).rejects.toThrow('Target directory already exists')
    expect(ensureDirMock).not.toHaveBeenCalled()
    expect(scaffoldTemplateMock).not.toHaveBeenCalled()
  })

  it('resolves create plan without writing files', async () => {
    const { resolveCreateNewProjectPlan } = await import('@/commands/create')
    const plan = await resolveCreateNewProjectPlan({ cwd: '/repo', name: 'demo-app', type: 'vue-hono' })

    expect(plan).toEqual(expect.objectContaining({
      cwd: '/repo',
      requestedTemplate: 'vue-hono',
      template: 'vue-hono',
      usedFallback: false,
      sourceDir: expect.stringContaining('/templates/client'),
      targetName: 'demo-app',
      targetDir: '/repo/demo-app',
      targetExists: false,
      hasPackageJson: true,
      packageJsonFileName: 'package.json',
      packageName: 'demo-app',
    }))
    expect(ensureDirMock).not.toHaveBeenCalled()
    expect(scaffoldTemplateMock).not.toHaveBeenCalled()
    expect(outputJsonMock).not.toHaveBeenCalled()
  })

  it('throws before writing files when requested type is unknown', async () => {
    resolveCommandConfigMock.mockResolvedValue({
      defaultTemplate: 'tsdown',
      renameJson: false,
    })

    const { createNewProject } = await import('@/commands/create')
    await expect(
      createNewProject({ cwd: '/repo', name: 'demo-app', type: 'unknown-template' }),
    )
      .rejects
      .toThrow('未知模板：unknown-template')

    expect(ensureDirMock).not.toHaveBeenCalled()
    expect(scaffoldTemplateMock).not.toHaveBeenCalled()
    expect(outputJsonMock).not.toHaveBeenCalled()
  })

  it('resolves custom templates from config without built-in fallback', async () => {
    resolveCommandConfigMock.mockResolvedValue({
      templateMap: {
        custom: { source: 'custom-template', target: 'apps/custom' },
      },
    })

    const { resolveCreateNewProjectPlan } = await import('@/commands/create')
    const plan = await resolveCreateNewProjectPlan({ cwd: '/repo', name: 'custom-app', type: 'custom' })

    expect(plan).toEqual(expect.objectContaining({
      requestedTemplate: 'custom',
      template: 'custom',
      usedFallback: false,
      sourceDir: expect.stringContaining('/templates/custom-template'),
      targetName: 'custom-app',
      targetDir: '/repo/custom-app',
    }))
  })

  it('writes package.mock.json when renameJson option is enabled', async () => {
    const { createNewProject } = await import('@/commands/create')
    await createNewProject({ cwd: '/repo', name: '@scope/demo', renameJson: true, type: 'tsdown' })

    const outputCall = outputJsonMock.mock.calls.find(args => args[0].endsWith('package.mock.json'))
    expect(outputCall).toBeDefined()
    const pkgJson = outputCall?.[1] as OutputPackageJson | undefined
    expect(pkgJson?.name).toBe('@scope/demo')
    expect(pkgJson?.author).toBe('Dev Example <dev@example.com>')
    expect(pkgJson?.bugs).toEqual(expect.objectContaining({ url: 'https://github.com/ice/awesome/issues' }))
    expect(pkgJson?.repository).toEqual(expect.objectContaining({
      type: 'git',
      url: 'git+https://github.com/ice/awesome.git',
      directory: '@scope/demo',
    }))
    expect(pkgJson?.homepage).toBeUndefined()
  })

  it('removes template-specific metadata when git info is unavailable', async () => {
    readJsonMock.mockResolvedValue({
      name: 'template',
      version: '1.0.0',
      author: 'ice breaker <hi@sonofmagic.top>',
      homepage: 'https://repoctl.icebreaker.top',
      bugs: {
        url: 'https://github.com/icelib/repoctl/issues',
      },
      repository: {
        type: 'git',
        url: 'git+https://github.com/icelib/repoctl.git',
      },
    } as any)
    getRepoNameMock.mockImplementation(async () => undefined as any)
    getUserMock.mockImplementation(async () => undefined as any)
    getRepoRootMock.mockImplementation(async () => undefined as any)

    const { createNewProject } = await import('@/commands/create')
    await createNewProject({ cwd: '/repo', name: 'clean-demo', renameJson: true, type: 'tsdown' })

    const outputCall = outputJsonMock.mock.calls.find(args => args[0].endsWith('package.mock.json'))
    const pkgJson = outputCall?.[1] as OutputPackageJson | undefined
    expect(pkgJson?.name).toBe('clean-demo')
    expect(pkgJson?.author).toBeUndefined()
    expect(pkgJson?.homepage).toBeUndefined()
    expect(pkgJson?.bugs).toBeUndefined()
    expect(pkgJson?.repository).toBeUndefined()
  })
})
