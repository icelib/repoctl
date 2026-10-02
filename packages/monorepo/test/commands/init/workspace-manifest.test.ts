import { lstat, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { getWorkspacePackages, initMetadata } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import fs from '@/utils/fs'

let root: string
const defaults = ['apps/*', 'packages/*', 'examples/*']

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-init-workspace-'))
})

afterEach(async () => {
  await fs.remove(root)
})

async function snapshotWorkspace() {
  const files: Record<string, string> = {}
  async function visit(directory: string) {
    for (const entry of (await readdir(directory)).sort()) {
      const file = path.join(directory, entry)
      const relative = path.relative(root, file)
      const info = await lstat(file)
      if (info.isDirectory()) {
        files[`${relative}/`] = 'directory'
        await visit(file)
      }
      else {
        files[relative] = `${info.mode}:${(await readFile(file)).toString('base64')}`
      }
    }
  }
  await visit(root)
  return files
}

async function writeRootPackage() {
  await fs.writeJson(path.join(root, 'package.json'), {
    name: 'workspace-fixture',
    private: true,
    packageManager: 'pnpm@10.33.1',
    scripts: { custom: 'echo keep' },
  })
}

async function writePackage(directory: string, name: string) {
  await fs.outputJson(path.join(root, directory, 'package.json'), { name, version: '1.0.0' })
}

async function packageNames() {
  return (await getWorkspacePackages(root, { ignorePrivatePackage: false })).map(pkg => pkg.manifest.name)
}

describe('built initialization workspace manifest preservation', () => {
  it.each([
    { name: 'scalar root', content: 'custom-workspace\n', error: 'must contain a mapping' },
    { name: 'sequence root', content: '- modules/*\n', error: 'must contain a mapping' },
    { name: 'boolean packages', content: 'packages: false\ncatalog: { typescript: "^5" }\n', error: 'packages must be an array of strings' },
    { name: 'mixed package entries', content: 'packages: ["modules/*", 17]\n', error: 'packages must be an array of strings' },
    { name: 'invalid glob', content: 'packages: ["["]\n', error: 'Invalid pnpm workspace pattern' },
    { name: 'invalid YAML', content: 'packages: [\n', error: 'Invalid pnpm-workspace.yaml' },
  ])('rejects $name before creating a root package or changing any file', async ({ content, error }) => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), content)
    await fs.writeFile(path.join(root, 'user-notes.txt'), 'keep this file\n')
    const before = await snapshotWorkspace()

    await expect(initMetadata(root)).rejects.toThrow(error)

    expect(await snapshotWorkspace()).toEqual(before)
    expect(await fs.pathExists(path.join(root, 'package.json'))).toBe(false)
  })

  it('leaves an existing root package, README and unrelated files unchanged on invalid configuration', async () => {
    await writeRootPackage()
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [false]\n')
    await fs.writeFile(path.join(root, 'README.md'), '# User documentation\n')
    await fs.outputFile(path.join(root, '.changeset/user-intent.md'), 'user intent\n')
    const before = await snapshotWorkspace()

    await expect(initMetadata(root)).rejects.toThrow('packages must be an array of strings')

    expect(await snapshotWorkspace()).toEqual(before)
  })

  it.each([
    '{}\n',
    'null\n',
    '# Use pnpm default discovery\ncatalog:\n  typescript: "^5" # shared version\n',
  ])('preserves implicit pnpm patterns and custom package discovery for %j', async (original) => {
    await writeRootPackage()
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), original)
    await writePackage('modules/api', 'fixture-api')
    expect(await packageNames()).toEqual(['fixture-api'])

    await initMetadata(root)

    expect(await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe(original)
    expect(await packageNames()).toEqual(['fixture-api'])
    expect(await fs.readFile(path.join(root, 'README.md'), 'utf8')).toContain('[fixture-api](modules/api)')
    const initialized = await snapshotWorkspace()
    await initMetadata(root)
    expect(await snapshotWorkspace()).toEqual(initialized)
  })

  it('appends only missing defaults while retaining comments, exclusions and other fields', async () => {
    await writeRootPackage()
    const original = [
      '# User workspace layout',
      'packages:',
      '  - modules/** # custom modules',
      '  - apps/* # existing default',
      '  - "!apps/private/**" # intentional exclusion',
      'catalog:',
      '  typescript: "^5" # shared version',
      'onlyBuiltDependencies: [esbuild]',
      '',
    ].join('\n')
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), original)
    await writePackage('modules/api', 'fixture-api')
    await writePackage('apps/private', 'fixture-private')

    await initMetadata(root)

    const next = await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')
    expect(YAML.parse(next)).toEqual({
      packages: ['modules/**', 'apps/*', '!apps/private/**', 'packages/*', 'examples/*'],
      catalog: { typescript: '^5' },
      onlyBuiltDependencies: ['esbuild'],
    })
    for (const comment of ['# User workspace layout', '# custom modules', '# existing default', '# intentional exclusion', '# shared version']) {
      expect(next).toContain(comment)
    }
    expect(await packageNames()).toEqual(['fixture-api'])
    const initialized = await snapshotWorkspace()
    await initMetadata(root)
    expect(await snapshotWorkspace()).toEqual(initialized)
  })

  it('keeps an already complete explicit manifest byte for byte across repeated initialization', async () => {
    await writeRootPackage()
    const original = '# Keep this layout\npackages: ["apps/*", "packages/*", "examples/*"] # intentional order\ncatalog: { typescript: "^5" }\n'
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), original)

    await initMetadata(root)
    expect(await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe(original)
    const initialized = await snapshotWorkspace()
    await initMetadata(root)
    expect(await snapshotWorkspace()).toEqual(initialized)
  })

  it('appends defaults to aliased packages without changing the anchor or other references', async () => {
    await writeRootPackage()
    const original = [
      'workspacePatterns: &pkgs',
      '  - modules/* # shared rule',
      'packages:',
      '  # workspace selection',
      '  *pkgs # keep alias rationale',
      'otherPatterns: *pkgs',
      '',
    ].join('\n')
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, original)
    await writePackage('modules/api', 'fixture-api')

    await initMetadata(root)

    const content = await fs.readFile(manifestPath, 'utf8')
    const document = YAML.parseDocument(content)
    expect(document.toJS()).toEqual({
      workspacePatterns: ['modules/*'],
      packages: ['modules/*', ...defaults],
      otherPatterns: ['modules/*'],
    })
    expect(document.get('workspacePatterns', true)).toMatchObject({ anchor: 'pkgs' })
    expect(document.get('otherPatterns', true)).toMatchObject({ source: 'pkgs' })
    for (const comment of ['# shared rule', '# workspace selection', '# keep alias rationale']) {
      expect(content).toContain(comment)
    }
    expect(await packageNames()).toEqual(['fixture-api'])
    const initialized = await snapshotWorkspace()
    await initMetadata(root)
    expect(await snapshotWorkspace()).toEqual(initialized)
  })

  it('preserves a complete aliased packages list byte for byte', async () => {
    const original = 'workspacePatterns: &pkgs [apps/*, packages/*, examples/*]\npackages: *pkgs # keep alias\notherPatterns: *pkgs\n'
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, original)

    await initMetadata(root)

    expect(await fs.readFile(manifestPath, 'utf8')).toBe(original)
    const initialized = await snapshotWorkspace()
    await initMetadata(root)
    expect(await snapshotWorkspace()).toEqual(initialized)
  })

  it('creates the existing recommended defaults when the manifest is absent', async () => {
    await initMetadata(root)

    expect(YAML.parse(await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')).packages).toEqual(defaults)
    expect(await fs.pathExists(path.join(root, 'package.json'))).toBe(true)
    const initialized = await snapshotWorkspace()
    await initMetadata(root)
    expect(await snapshotWorkspace()).toEqual(initialized)
  })

  it.each(['', '# This workspace is being initialized\n'])('initializes empty documents while preserving comments: %j', async (original) => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), original)
    await writePackage('packages/api', 'fixture-api')

    await initMetadata(root)

    const manifest = await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')
    expect(YAML.parse(manifest).packages).toEqual(defaults)
    if (original) {
      expect(manifest).toContain(original.trim())
    }
    expect(await packageNames()).toEqual(['fixture-api'])
    const initialized = await snapshotWorkspace()
    await initMetadata(root)
    expect(await snapshotWorkspace()).toEqual(initialized)
  })

  it('can initialize after the user repairs a previously rejected manifest', async () => {
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, 'packages: [\n')
    await expect(initMetadata(root)).rejects.toThrow('Invalid pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, 'packages: [modules/*]\n')
    await writePackage('modules/api', 'fixture-api')

    await initMetadata(root)

    expect(await packageNames()).toEqual(['fixture-api'])
    expect(YAML.parse(await fs.readFile(manifestPath, 'utf8')).packages).toEqual(['modules/*', ...defaults])
  })
})
