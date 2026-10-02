import type { TemplateDefinition } from '@icebreakers/monorepo-templates'
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

describe('createNewProject preflight and metadata', () => {
  it('returns choices and merges custom definitions', async () => {
    const { getCreateChoices, getTemplateMap } = await import('@/commands/create')
    expect(getCreateChoices()).toHaveLength(6)
    const choices = [{ name: 'custom', value: 'custom' }]
    expect(getCreateChoices(choices)).toBe(choices)
    const merged = getTemplateMap({ custom: 'custom-template' }) as Record<string, TemplateDefinition>
    expect(merged['custom']).toEqual({ source: 'custom-template', target: 'custom-template' })
    expect(merged['tsdown']).toEqual({ source: 'tsdown', target: 'packages/tsdown' })
  })

  it('rejects an existing target without changing its contents', async () => {
    await fs.outputFile(path.join(root, 'demo/user.txt'), 'user data')
    const { createNewProject } = await import('@/commands/create')
    await expect(createNewProject({ cwd: root, name: 'demo' })).rejects.toThrow('Target directory already exists')
    expect(await fs.readFile(path.join(root, 'demo/user.txt'), 'utf8')).toBe('user data')
    expect(scaffoldTemplateMock).not.toHaveBeenCalled()
  })

  it('resolves a validated plan without writing project files', async () => {
    const { resolveCreateNewProjectPlan } = await import('@/commands/create')
    const plan = await resolveCreateNewProjectPlan({ cwd: root, name: 'demo-app', type: 'vue-hono' })
    expect(plan).toMatchObject({
      cwd: root,
      requestedTemplate: 'vue-hono',
      template: 'vue-hono',
      usedFallback: false,
      sourceDir: path.join(templatesDir, 'client'),
      targetName: 'demo-app',
      targetDir: path.join(root, 'demo-app'),
      targetExists: false,
      hasPackageJson: true,
      packageJsonFileName: 'package.json',
      packageName: 'demo-app',
      workspaceManifest: { changed: true, pattern: 'demo-app' },
    })
    expect(await fs.readdir(root)).toEqual(['templates'])
    expect(scaffoldTemplateMock).not.toHaveBeenCalled()
  })

  it('rejects an unknown template before writing', async () => {
    const { createNewProject } = await import('@/commands/create')
    await expect(createNewProject({ cwd: root, name: 'demo-app', type: 'unknown-template' })).rejects.toThrow('未知模板：unknown-template')
    expect(await fs.readdir(root)).toEqual(['templates'])
  })

  it('resolves custom template configuration', async () => {
    resolveCommandConfigMock.mockResolvedValue({ templatesDir, templateMap: { custom: { source: 'custom-template', target: 'apps/custom' } } })
    const { resolveCreateNewProjectPlan } = await import('@/commands/create')
    const plan = await resolveCreateNewProjectPlan({ cwd: root, type: 'custom' })
    expect(plan).toMatchObject({ template: 'custom', sourceDir: path.join(templatesDir, 'custom-template'), targetName: 'apps/custom' })
  })

  it('keeps scoped names and writes git metadata into package.mock.json', async () => {
    const { createNewProject } = await import('@/commands/create')
    await createNewProject({ cwd: root, name: '@scope/demo', renameJson: true })
    const pkg = await fs.readJson(path.join(root, '@scope/demo/package.mock.json'))
    expect(pkg).toMatchObject({
      name: '@scope/demo',
      version: '0.0.0',
      author: 'Dev Example <dev@example.com>',
      bugs: { url: 'https://github.com/ice/awesome/issues' },
      repository: { type: 'git', url: 'git+https://github.com/ice/awesome.git', directory: '@scope/demo' },
    })
    expect(pkg.homepage).toBeUndefined()
  })

  it('removes template metadata when git information is unavailable', async () => {
    getRepoNameMock.mockResolvedValue(undefined)
    const { createNewProject } = await import('@/commands/create')
    await createNewProject({ cwd: root, name: 'demo' })
    expect(await fs.readJson(path.join(root, 'demo/package.json'))).toEqual({ name: 'demo', version: '0.0.0' })
  })
})
