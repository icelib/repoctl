import { readlink, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import YAML from 'yaml'
import { clearWorkspaceCache, getWorkspacePackages } from '@/core/workspace'
import fs from '@/utils/fs'

let root: string
let template: string

beforeEach(async () => {
  vi.resetModules()
  clearWorkspaceCache()
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-create-workspace-'))
  template = path.join(root, 'template-source/minimal')
  await fs.outputJson(path.join(template, 'package.json'), { name: 'template', version: '1.0.0' })
  await fs.outputJson(path.join(root, 'package.json'), { name: 'test-workspace', private: true })
  vi.doMock('@/core/config', () => ({
    resolveCommandConfig: vi.fn(async () => ({ templatesDir: path.dirname(template), templateMap: { custom: 'minimal' } })),
  }))
})

afterEach(async () => {
  vi.doUnmock('@/core/config')
  clearWorkspaceCache()
  await fs.remove(root)
})

async function create(name: string) {
  const { createNewProject } = await import('@/commands/create')
  await createNewProject({ cwd: root, name, type: 'custom' })
}

async function packageNames() {
  clearWorkspaceCache()
  return (await getWorkspacePackages(root, { ignorePrivatePackage: false })).map(pkg => pkg.manifest.name)
}

describe('create workspace membership', () => {
  it.each(['single', 'apps/platform/web/client', '@scope/scoped'])('registers the exact created path in a real pnpm workspace: %s', async (name) => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
    await create(name)
    const manifest = YAML.parse(await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'))
    expect(manifest.packages).toEqual([name])
    expect(await packageNames()).toContain(name.startsWith('@') ? name : path.basename(name))
  })

  it.each(['apps/**', '{apps,packages}/**', 'apps/+(platform|other)/**', '!(examples)/**'])('preserves an already sufficient manifest byte for byte: %s', async (pattern) => {
    const original = `# Keep this comment\npackages: [${JSON.stringify(pattern)}]\ncatalog: {}\n`
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), original)
    const { resolveCreateNewProjectPlan } = await import('@/commands/create')
    expect((await resolveCreateNewProjectPlan({ cwd: root, name: 'apps/platform/client', type: 'custom' })).workspaceManifest.changed).toBe(false)
    await create('apps/platform/client')
    expect(await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe(original)
    expect(await packageNames()).toContain('client')
  })

  it('escapes glob characters in an exact directory path', async () => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
    await create('apps/team[1]/client')
    expect(await packageNames()).toContain('client')
  })

  it('keeps YAML comments while appending an uncovered target', async () => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), '# workspace comment\npackages:\n  - packages/* # existing packages\ncatalog:\n  vue: ^3.0.0\n')
    await create('apps/deep/client')
    const content = await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')
    expect(content).toContain('# workspace comment')
    expect(content).toContain('# existing packages')
    expect(YAML.parse(content)).toMatchObject({ packages: ['packages/*', 'apps/deep/client'], catalog: { vue: '^3.0.0' } })
  })

  it('does not override explicit workspace exclusions', async () => {
    const original = 'packages:\n  - apps/**\n  - "!apps/private/**"\n'
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), original)
    await expect(create('apps/private/client')).rejects.toThrow('excluded')
    expect(await fs.pathExists(path.join(root, 'apps'))).toBe(false)
    expect(await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe(original)
  })

  it.each(['packages: [', 'packages: false', 'packages: [42]', '[]'])('rejects invalid workspace YAML before writing: %s', async (content) => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), content)
    await expect(create('apps/client')).rejects.toThrow()
    expect(await fs.pathExists(path.join(root, 'apps'))).toBe(false)
    expect(await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe(content)
  })

  it('rejects malformed workspace globs before writing', async () => {
    const original = 'packages: ["["]\n'
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), original)
    await expect(create('apps/client')).rejects.toThrow('Invalid pnpm workspace pattern')
    expect(await fs.pathExists(path.join(root, 'apps'))).toBe(false)
    expect(await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe(original)
  })

  it('rejects a parent symlink pointing outside the workspace', async () => {
    const outside = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-create-outside-'))
    try {
      await symlink(outside, path.join(root, 'apps'), 'dir')
      await expect(create('apps/client')).rejects.toThrow('outside the workspace')
      expect(await fs.readdir(outside)).toEqual([])
    }
    finally {
      await fs.remove(outside)
    }
  })

  it('does not replace a linked workspace manifest when it needs a new pattern', async () => {
    const linkedRoot = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-linked-manifest-'))
    const linkedManifest = path.join(linkedRoot, 'pnpm-workspace.yaml')
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    try {
      await fs.writeFile(linkedManifest, 'packages: []\n')
      await symlink(linkedManifest, manifestPath)
      await expect(create('apps/client')).rejects.toThrow('symbolic')
      expect(await fs.readFile(linkedManifest, 'utf8')).toBe('packages: []\n')
      expect(await readlink(manifestPath)).toBe(linkedManifest)
      expect(await fs.pathExists(path.join(root, 'apps'))).toBe(false)
    }
    finally {
      await fs.remove(linkedRoot)
    }
  })

  it('invalidates discovery cached before creation', async () => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [apps/**]\n')
    const { getWorkspacePackages: discover } = await import('@/core/workspace')
    expect(await discover(root)).toEqual([])
    await create('apps/client')
    expect((await discover(root)).map(pkg => pkg.manifest.name)).toContain('client')
  })

  it('invalidates discovery cached before cleaning a package', async () => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [packages/*]\n')
    const packageDir = path.join(root, 'packages/client')
    await fs.outputJson(path.join(packageDir, 'package.json'), { name: 'client', version: '1.0.0' })

    const { getWorkspacePackages: discover } = await import('@/core/workspace')
    expect((await discover(root)).map(pkg => pkg.manifest.name)).toEqual(['client'])

    const { cleanProjects } = await import('@/commands/clean')
    await cleanProjects(root, { autoConfirm: true })

    expect(await fs.pathExists(packageDir)).toBe(false)
    expect(await discover(root)).toEqual([])
  })

  it('adds an explicit inclusion when the manifest only contains exclusions', async () => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: ["!apps/private/**"]\n')
    await create('apps/client')
    const manifest = YAML.parse(await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'))
    expect(manifest.packages).toEqual(['!apps/private/**', 'apps/client'])
    expect(await packageNames()).toContain('client')
  })
})
