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
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-create-unit-'))
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

describe('create transaction recovery', () => {
  it('removes the target ownership marker after a successful create', async () => {
    const { createNewProject } = await import('@/commands/create')
    await createNewProject({ cwd: root, name: 'apps/demo' })
    expect(await fs.pathExists(path.join(root, 'apps/demo/.repoctl-create-target.json'))).toBe(false)
  })

  it('reports a stale partial target without changing user files', async () => {
    const targetDir = path.join(root, 'apps/demo')
    const markerPath = path.join(targetDir, '.repoctl-create-target.json')
    await fs.outputFile(path.join(targetDir, 'partial.txt'), 'user edit')
    await fs.outputJson(markerPath, {
      schemaVersion: 1,
      pid: 2 ** 31 - 1,
      cwd: root,
      targetDir,
      stagingDir: path.join(root, '.repoctl-create-interrupted'),
      createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    })
    const before = await fs.readFile(path.join(targetDir, 'partial.txt'), 'utf8')
    const { inspectCreateTarget } = await import('@/commands/create')
    await expect(inspectCreateTarget(targetDir)).resolves.toMatchObject({
      targetDir,
      status: 'stale',
    })
    expect(await fs.readFile(path.join(targetDir, 'partial.txt'), 'utf8')).toBe(before)
    expect(await fs.pathExists(markerPath)).toBe(true)
  })

  it('does not trust an ownership marker with an invalid pid', async () => {
    const targetDir = path.join(root, 'apps/demo')
    const markerPath = path.join(targetDir, '.repoctl-create-target.json')
    await fs.outputJson(markerPath, {
      schemaVersion: 1,
      pid: 0,
      cwd: root,
      targetDir,
      stagingDir: path.join(root, '.repoctl-create-interrupted'),
      createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    })

    const { inspectCreateTarget } = await import('@/commands/create')
    await expect(inspectCreateTarget(targetDir)).resolves.toMatchObject({
      targetDir,
      status: 'malformed',
    })
  })

  it.each(['../outside', '.'])('rejects a target outside the workspace or at its root: %s', async (name) => {
    const { createNewProject } = await import('@/commands/create')
    await expect(createNewProject({ cwd: root, name })).rejects.toThrow('inside the workspace')
    expect(scaffoldTemplateMock).not.toHaveBeenCalled()
  })

  it.each(['missing', 'malformed', 'array'])('rejects invalid template sources before creating a target: %s', async (kind) => {
    if (kind === 'missing') {
      await fs.remove(path.join(templatesDir, 'tsdown'))
    }
    else {
      await fs.writeFile(path.join(templatesDir, 'tsdown/package.json'), kind === 'array' ? '[]' : '{')
    }
    const { resolveCreateNewProjectPlan } = await import('@/commands/create')
    await expect(resolveCreateNewProjectPlan({ cwd: root, name: 'demo' })).rejects.toThrow()
    expect(await fs.readdir(root)).toEqual(['templates'])
  })

  it('cleans partial staging after generation fails so creation can be retried', async () => {
    const { createNewProject } = await import('@/commands/create')
    scaffoldTemplateMock.mockImplementationOnce(async ({ targetDir }) => {
      await fs.outputFile(path.join(targetDir, 'partial.txt'), 'partial')
      throw new Error('copy interrupted')
    })
    await expect(createNewProject({ cwd: root, name: 'apps/demo' })).rejects.toThrow('copy interrupted')
    expect(await fs.readdir(root)).toEqual(['templates'])
    await createNewProject({ cwd: root, name: 'apps/demo' })
    expect(await fs.pathExists(path.join(root, 'apps/demo/package.json'))).toBe(true)
  })

  it('cleans an old staging directory only when its ownership marker is stale', async () => {
    const staging = await fs.mkdtemp(path.join(root, '.repoctl-create-'))
    await fs.outputJson(path.join(staging, '.repoctl-create.json'), {
      schemaVersion: 1,
      pid: 2 ** 31 - 1,
      cwd: root,
      targetDir: path.join(root, 'apps/demo'),
      createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    })
    const { createNewProject } = await import('@/commands/create')
    await createNewProject({ cwd: root, name: 'apps/demo' })
    expect(await fs.pathExists(staging)).toBe(false)
    expect(await fs.pathExists(path.join(root, 'apps/demo/package.json'))).toBe(true)
  })

  it('leaves unmarked staging directories for manual review', async () => {
    const staging = await fs.mkdtemp(path.join(root, '.repoctl-create-'))
    await fs.outputFile(path.join(staging, 'partial.txt'), 'partial')
    const { createNewProject } = await import('@/commands/create')
    await createNewProject({ cwd: root, name: 'apps/demo' })
    expect(await fs.pathExists(path.join(staging, 'partial.txt'))).toBe(true)
  })

  it('rolls back a partial target file when publishing is interrupted', async () => {
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return {
        ...actual,
        copyFile: vi.fn(async (source, target, flags) => {
          if (target.startsWith(`${path.join(root, 'apps/demo')}/`)) {
            await actual.writeFile(target, 'partial')
            throw new Error('copy interrupted')
          }
          return actual.copyFile(source, target, flags)
        }),
      }
    })
    const { createNewProject } = await import('@/commands/create')
    await expect(createNewProject({ cwd: root, name: 'apps/demo' })).rejects.toThrow('copy interrupted')
    expect(await fs.pathExists(path.join(root, 'apps/demo/package.json'))).toBe(false)
    expect(await fs.pathExists(path.join(root, 'apps'))).toBe(false)
  })

  it('preserves a concurrently created target instead of replacing it', async () => {
    const { createNewProject } = await import('@/commands/create')
    const delegate = scaffoldTemplateMock.getMockImplementation()!
    scaffoldTemplateMock.mockImplementationOnce(async (options) => {
      await delegate(options)
      await fs.outputFile(path.join(root, 'apps/demo/user.txt'), 'keep me')
    })
    await expect(createNewProject({ cwd: root, name: 'apps/demo' })).rejects.toThrow()
    expect(await fs.readFile(path.join(root, 'apps/demo/user.txt'), 'utf8')).toBe('keep me')
    expect(await fs.pathExists(path.join(root, 'pnpm-workspace.yaml'))).toBe(false)
  })

  it('rolls back the new target if the workspace manifest changes during generation', async () => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
    const { createNewProject } = await import('@/commands/create')
    const delegate = scaffoldTemplateMock.getMockImplementation()!
    scaffoldTemplateMock.mockImplementationOnce(async (options) => {
      await delegate(options)
      await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [other/*]\n')
    })
    await expect(createNewProject({ cwd: root, name: 'apps/demo' })).rejects.toThrow('changed during creation')
    expect(await fs.pathExists(path.join(root, 'apps'))).toBe(false)
    expect(await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe('packages: [other/*]\n')
  })

  it.each([false, true])('recovers safely after manifest commit fails (concurrent user file: %s)', async (addUserFile) => {
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    const original = 'packages: []\n'
    await fs.writeFile(manifestPath, original)
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return {
        ...actual,
        rename: vi.fn(async (source: string, target: string) => {
          if (target === manifestPath) {
            if (addUserFile) {
              await actual.writeFile(path.join(root, 'apps/demo/user.txt'), 'user data')
            }
            throw new Error('manifest commit failed')
          }
          return actual.rename(source, target)
        }),
      }
    })
    const { createNewProject } = await import('@/commands/create')
    await expect(createNewProject({ cwd: root, name: 'apps/demo' })).rejects.toThrow('manifest commit failed')
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(original)
    expect(await fs.pathExists(path.join(root, 'apps/demo/package.json'))).toBe(false)
    if (addUserFile) {
      expect(await fs.readFile(path.join(root, 'apps/demo/user.txt'), 'utf8')).toBe('user data')
    }
    else {
      expect(await fs.pathExists(path.join(root, 'apps'))).toBe(false)
    }
    expect((await fs.readdir(root)).some(entry => entry.startsWith('.repoctl-create-'))).toBe(false)
  })

  it.each([
    { existing: false, operation: 'link' as const },
    { existing: true, operation: 'rename' as const },
  ])('restores the workspace manifest when %s commits before reporting failure', async ({ existing, operation }) => {
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    const original = 'packages: []\n'
    if (existing) {
      await fs.writeFile(manifestPath, original)
    }

    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      const commit = actual[operation] as (source: string, target: string) => Promise<void>
      return {
        ...actual,
        [operation]: vi.fn(async (source: string, target: string) => {
          await commit(source, target)
          if (target === manifestPath) {
            throw new Error(`manifest ${operation} committed before failure`)
          }
        }),
      }
    })

    const { createNewProject } = await import('@/commands/create')
    await expect(createNewProject({ cwd: root, name: 'apps/demo' })).rejects.toThrow(`manifest ${operation} committed before failure`)
    if (existing) {
      expect(await fs.readFile(manifestPath, 'utf8')).toBe(original)
    }
    else {
      expect(await fs.pathExists(manifestPath)).toBe(false)
    }
    expect(await fs.pathExists(path.join(root, 'apps'))).toBe(false)
    expect((await fs.readdir(root)).some(entry => entry.startsWith('.repoctl-create-'))).toBe(false)
  })

  it('preserves a manifest edit made after an ambiguous commit', async () => {
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    const original = 'packages: []\n'
    const userContent = 'packages: [user/*]\n'
    await fs.writeFile(manifestPath, original)

    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return {
        ...actual,
        rename: vi.fn(async (source: string, target: string) => {
          await actual.rename(source, target)
          if (target === manifestPath) {
            await actual.writeFile(target, userContent)
            throw new Error('manifest commit raced with user edit')
          }
        }),
      }
    })

    const { createNewProject } = await import('@/commands/create')
    await expect(createNewProject({ cwd: root, name: 'apps/demo' })).rejects.toThrow('manifest commit raced with user edit')
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(userContent)
    expect(await fs.pathExists(path.join(root, 'apps'))).toBe(false)
  })
})
