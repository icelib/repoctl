import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'

const packagePathPattern = /^packages\//

describe('coverage binder', () => {
  afterEach(() => {
    vi.doUnmock('@icebreakers/monorepo-templates')
  })

  it('executes getTemplateTargets helper', async () => {
    await vi.resetModules()
    const rawMock = vi.fn(async () => 'README.md\npackage.json\n')
    vi.doMock('simple-git', () => ({
      simpleGit: vi.fn(() => ({ raw: rawMock })),
    }))

    const { getTemplateTargets } = await import('./helpers/getTemplateTargets')
    const targets = await getTemplateTargets()
    expect(targets).toEqual(expect.arrayContaining(['README.md', 'package.json']))
  })

  it('executes create command primary flow', async () => {
    await vi.resetModules()
    const ensureDirMock = vi.fn(async () => {})
    const pathExistsMock = vi.fn(async (targetPath: string) => targetPath.endsWith('package.json'))
    const readJsonMock = vi.fn(async () => ({ name: 'template', version: '1.0.0' }))
    const outputJsonMock = vi.fn(async () => {})
    const outputFileMock = vi.fn(async () => {})
    const scaffoldTemplateMock = vi.fn(async () => {})

    vi.doMock('@/utils/fs', async () => {
      const actual = await vi.importActual<typeof import('@/utils/fs')>('@/utils/fs')
      return {
        ...actual,
        default: {
          ...actual.default,
          ensureDir: ensureDirMock,
          pathExists: pathExistsMock,
          readJson: readJsonMock,
          outputJson: outputJsonMock,
          outputFile: outputFileMock,
        },
        ensureDir: ensureDirMock,
        pathExists: pathExistsMock,
        readJson: readJsonMock,
        outputJson: outputJsonMock,
        outputFile: outputFileMock,
      }
    })
    vi.doMock('@icebreakers/monorepo-templates', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@icebreakers/monorepo-templates')>()
      return {
        ...actual,
        scaffoldTemplate: scaffoldTemplateMock,
        createTemplateInstanceTarget: ensureDirMock,
        prepareTemplateInstanceSource: vi.fn(async () => ({ snapshot: { schemaVersion: 1, files: [], directories: [] } })),
        snapshotDigest: vi.fn(() => 'unchanged'),
        recordGeneratedTemplateInstance: vi.fn(async () => {}),
      }
    })
    vi.doMock('@/core/config', () => ({
      loadMonorepoConfigDetails: vi.fn(async () => ({
        file: '/repo/repoctl.config.mjs',
        rawLayers: [],
        config: { commands: { create: {
          renameJson: true,
          name: 'my-app',
          templatesDir: './templates',
          templateMap: { custom: 'custom/path' },
          defaultTemplate: 'custom',
        } } },
      })),
    }))
    const successMock = vi.fn()
    vi.doMock('@/core/logger', () => ({
      logger: {
        success: successMock,
      },
    }))

    const { createNewProject } = await import('@/commands/create')
    await createNewProject({ cwd: '/repo', type: 'custom' })
    expect(scaffoldTemplateMock).toHaveBeenCalled()
    expect(outputJsonMock).toHaveBeenCalledWith(path.join('/repo', 'my-app', 'package.mock.json'), expect.any(Object), { spaces: 2 })
    expect(successMock).toHaveBeenCalled()
  })

  it('executes upgrade targets helper', async () => {
    await vi.resetModules()
    vi.doUnmock('@icebreakers/monorepo-templates')
    const { getAssetTargets } = await import('@icebreakers/monorepo-templates')
    const targets = getAssetTargets()
    expect(targets).toContain('.changeset')
  })

  it('executes core config helpers', async () => {
    await vi.resetModules()
    const { loadMonorepoConfig, resolveCommandConfig, defineMonorepoConfig } = await vi.importActual<typeof import('@/core/config')>('@/core/config')
    defineMonorepoConfig({ commands: { clean: { autoConfirm: true } } })
    const tempDir = await mkdtemp(path.join(tmpdir(), 'monorepo-config-'))
    const config = await loadMonorepoConfig(tempDir)
    expect(config.commands?.clean).toBeUndefined()
    // second call should hit cache
    await loadMonorepoConfig(tempDir)
    expect(await resolveCommandConfig('clean', tempDir)).toEqual({})
    expect(await resolveCommandConfig('mirror', tempDir)).toEqual({})
  })

  it('executes utility helpers', async () => {
    const fsModule = await import('@/utils/fs')
    expect(fsModule.isIgnorableFsError({ code: 'ENOENT' } as NodeJS.ErrnoException)).toBe(true)
    expect(fsModule.isIgnorableFsError({ code: 'EPERM' } as NodeJS.ErrnoException)).toBe(false)

    const gitignoreModule = await import('@/utils/gitignore')
    expect(gitignoreModule.toPublishGitignorePath('.gitignore')).toBe('gitignore')
    expect(gitignoreModule.toWorkspaceGitignorePath('gitignore')).toBe('.gitignore')
    expect(gitignoreModule.isGitignoreFile('README.md')).toBe(false)

    const hashModule = await import('@/utils/hash')
    await hashModule.isFileChanged('a', 'b')

    const regexpModule = await import('@/utils/regexp')
    expect(regexpModule.escapeStringRegexp('a+b')).toBe('a\\+b')
    expect(regexpModule.isMatch('packages/a', [packagePathPattern])).toBe(true)
  })
})
