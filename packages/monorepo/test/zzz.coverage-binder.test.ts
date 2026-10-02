import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'

const packagePathPattern = /^packages\//

describe('coverage binder', () => {
  afterEach(() => {
    vi.doUnmock('@icebreakers/monorepo-templates')
    vi.doUnmock('@/utils/fs')
    vi.doUnmock('node:fs/promises')
    vi.doUnmock('simple-git')
    vi.doUnmock('@/core/config')
    vi.doUnmock('@/core/logger')
  })

  it('executes vitest setup paths', async () => {
    await vi.resetModules()
    const pathExistsMock = vi.fn()
    const prepareAssetsMock = vi.fn(async () => {})
    const lockCloseMock = vi.fn(async () => {})
    const openMock = vi.fn(async () => ({ close: lockCloseMock }))
    const rmMock = vi.fn(async () => {})

    vi.doMock('@/utils/fs', async () => {
      const actual = await vi.importActual<typeof import('@/utils/fs')>('@/utils/fs')
      return {
        ...actual,
        default: { ...actual.default, pathExists: pathExistsMock },
        pathExists: pathExistsMock,
      }
    })
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return {
        ...actual,
        open: openMock,
        rm: rmMock,
      }
    })
    vi.doMock('@icebreakers/monorepo-templates', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@icebreakers/monorepo-templates')>()
      return {
        ...actual,
        assetsDir: '/assets',
        prepareAssets: prepareAssetsMock,
      }
    })

    pathExistsMock.mockResolvedValueOnce(false)
    await import('../vitest.setup')
    expect(prepareAssetsMock).toHaveBeenCalledWith({ silent: true, overwriteExisting: false })

    pathExistsMock.mockResolvedValueOnce(true)
    await import('../vitest.setup')
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

  it('creates a configured custom template with real filesystem output', async () => {
    vi.resetModules()
    const root = await mkdtemp(path.join(tmpdir(), 'repoctl-configured-create-'))
    try {
      const source = path.join(root, 'templates/custom/path')
      await mkdir(source, { recursive: true })
      await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'template', version: '1.0.0' }))
      await writeFile(path.join(source, 'README.md'), 'Custom template\n')
      await writeFile(path.join(root, 'repoctl.config.ts'), `export default {
  commands: {
    create: {
      renameJson: true,
      name: 'my-app',
      templatesDir: './templates',
      templateMap: { custom: 'custom/path' },
      defaultTemplate: 'custom',
    },
  },
}\n`)
      const { createNewProject } = await import('@/commands/create')
      await createNewProject({ cwd: root })
      expect(JSON.parse(await readFile(path.join(root, 'my-app/package.mock.json'), 'utf8'))).toMatchObject({ name: 'my-app', version: '0.0.0' })
      expect(await readFile(path.join(root, 'my-app/README.md'), 'utf8')).toBe('Custom template\n')
      expect(await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')).toContain('my-app')
      expect((await readdir(root)).some(entry => entry.startsWith('.repoctl-create-'))).toBe(false)
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
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
