import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from '@/utils/fs'

let root: string
let templatesDir: string
const resolveCommandConfigMock = vi.fn()
const getRepoNameMock = vi.fn()
const scaffoldTemplateMock = vi.fn()

beforeEach(async () => {
  vi.resetModules()
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-create-race-'))
  templatesDir = path.join(root, 'templates')
  for (const template of ['tsdown', 'vue-lib', 'client', 'server', 'cli', 'vitepress', 'custom-template']) {
    await fs.outputJson(path.join(templatesDir, template, 'package.json'), {
      name: 'template',
      version: '1.0.0',
      author: 'Template Author',
      homepage: 'https://example.com/template',
      bugs: { url: 'https://example.com/template/issues' },
      repository: { type: 'git', url: 'https://example.com/template.git' },
    })
  }
  resolveCommandConfigMock.mockReset().mockResolvedValue({ templatesDir })
  getRepoNameMock.mockReset().mockResolvedValue('ice/awesome')
  scaffoldTemplateMock.mockReset()
  vi.doMock('@/core/config', () => ({ resolveCommandConfig: resolveCommandConfigMock }))
  vi.doMock('@/core/git', () => ({
    GitClient: class {
      getRepoName() { return getRepoNameMock() }
      async getUser() { return { name: 'Dev Example', email: 'dev@example.com' } }
      async getRepoRoot() { return root }
    },
  }))
  vi.doMock('@icebreakers/monorepo-templates', async () => {
    const actual = await vi.importActual<typeof import('@icebreakers/monorepo-templates')>('@icebreakers/monorepo-templates')
    scaffoldTemplateMock.mockImplementation(actual.scaffoldTemplate)
    return { ...actual, scaffoldTemplate: scaffoldTemplateMock }
  })
})

afterEach(async () => {
  vi.doUnmock('@/core/config')
  vi.doUnmock('@/core/git')
  vi.doUnmock('@icebreakers/monorepo-templates')
  vi.doUnmock('node:fs/promises')
  await fs.remove(root)
})

describe('create staging cleanup races', () => {
  it('preserves a staging replacement during stale cleanup', async () => {
    const staging = await fs.mkdtemp(path.join(root, '.repoctl-create-'))
    const backup = `${staging}.backup`
    const foreign = await fs.mkdtemp(path.join(root, '.foreign-staging-'))
    await fs.outputFile(path.join(foreign, 'keep.txt'), 'keep')
    await fs.outputJson(path.join(staging, '.repoctl-create.json'), {
      schemaVersion: 1,
      pid: 2 ** 31 - 1,
      cwd: root,
      targetDir: path.join(root, 'apps/demo'),
      createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    })
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      let replaced = false
      return {
        ...actual,
        lstat: vi.fn(async (entry: string) => {
          if (entry === staging && !replaced) {
            const result = await actual.lstat(entry)
            replaced = true
            await actual.rename(staging, backup)
            await actual.rename(foreign, staging)
            return result
          }
          return actual.lstat(entry)
        }),
      }
    })
    vi.resetModules()
    const { cleanupStaleCreateStaging } = await import('@/commands/create/recovery')
    await cleanupStaleCreateStaging(root)
    expect(await fs.readFile(path.join(staging, 'keep.txt'), 'utf8')).toBe('keep')
    expect(await fs.pathExists(path.join(backup, '.repoctl-create.json'))).toBe(true)
  })

  it('preserves a staging replacement during failed create cleanup', async () => {
    const foreign = await fs.mkdtemp(path.join(root, '.foreign-staging-'))
    await fs.outputFile(path.join(foreign, 'keep.txt'), 'keep')
    let replaced = false
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return {
        ...actual,
        rename: vi.fn(async (source: string, target: string) => {
          if (!replaced && source.startsWith(path.join(root, '.repoctl-create-')) && target.endsWith('.removing')) {
            replaced = true
            await actual.rename(source, `${source}.backup`)
            await actual.rename(foreign, source)
          }
          return actual.rename(source, target)
        }),
      }
    })
    vi.resetModules()
    const createModule = await import('@/commands/create')
    scaffoldTemplateMock.mockImplementationOnce(async (options) => {
      await fs.outputFile(path.join(options.targetDir, 'partial.txt'), 'partial')
      throw new Error('copy interrupted')
    })
    await expect(createModule.createNewProject({ cwd: root, name: 'apps/demo' })).rejects.toThrow('copy interrupted')
    const staging = (await fs.readdir(root)).find(entry => entry.startsWith('.repoctl-create-'))
    expect(staging).toBeDefined()
    expect(await fs.readFile(path.join(root, staging!, 'keep.txt'), 'utf8')).toBe('keep')
  })
})
