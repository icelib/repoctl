import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { clearWorkspaceCache, getWorkspacePackages, resolveUpgradePlan } from '@icebreakers/monorepo'
import { afterEach, expect } from 'vitest'

const roots: string[] = []
const legacyWorkflow = 'uses: changesets/action\nrun: changeset publish\n'
export const customWorkflow = 'name: custom\njobs: {}\n'
export const invalidCatalog = 'packages: [apps/*]\ncatalogs: { modern: null }\n'
export const implicitMerge = '%YAML 1.1\n---\ndefaults: &rules { packages: [apps/**] }\n<<: *rules\n'
export const catalogOn = '%YAML 1.1\n---\npackages: [apps/*]\ncatalog: { internal-tool: on }\n'
export const allPackageNames = ['api-package', 'lib-package', 'on-package', 'site-package']

interface FixtureOptions {
  legacy?: 'config' | 'pre'
  customRelease?: boolean
}

export function registerFixtureCleanup() {
  afterEach(async () => {
    clearWorkspaceCache()
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })
}

async function outputFile(root: string, relativePath: string, content: string) {
  const filename = path.join(root, relativePath)
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, content)
}

export async function createWorkspace(source: string, options: FixtureOptions = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-upgrade-workspace-'))
  roots.push(root)
  await outputFile(root, 'package.json', JSON.stringify({
    name: 'fixture-root',
    private: true,
    devDependencies: { '@changesets/cli': '^2.0.0' },
  }))
  await outputFile(root, 'repoctl.config.mjs', `export default ${JSON.stringify({ commands: { upgrade: {
    targets: ['package.json', 'pnpm-workspace.yaml', '.github/workflows/release.yml'],
    mergeTargets: false,
  } } })}\n`)
  await outputFile(root, 'pnpm-workspace.yaml', source)
  await outputFile(root, 'user/notes.txt', 'keep user content\n')
  for (const [directory, name] of [
    ['on', 'on-package'],
    ['apps/site', 'site-package'],
    ['packages/lib', 'lib-package'],
    ['services/api', 'api-package'],
  ]) {
    await outputFile(root, `${directory}/package.json`, JSON.stringify({ name, version: '1.0.0' }))
  }
  await outputFile(root, '.github/workflows/release.yml', options.customRelease ? customWorkflow : legacyWorkflow)
  if (options.legacy) {
    await outputFile(root, '.changeset/config.json', '{"changelog":false}\n')
  }
  if (options.legacy === 'pre') {
    await outputFile(root, '.changeset/pre.json', '{"mode":"pre","tag":"beta"}\n')
  }
  return root
}

export async function snapshotWorkspace(root: string) {
  const entries: Record<string, string> = {}
  async function visit(relative: string) {
    for (const name of (await readdir(path.join(root, relative))).sort()) {
      const key = relative ? `${relative}/${name}` : name
      const absolute = path.join(root, key)
      const stat = await lstat(absolute)
      if (stat.isDirectory()) {
        entries[`${key}/`] = `directory:${stat.mode}`
        await visit(key)
      }
      else {
        entries[key] = `${stat.mode}:${(await readFile(absolute)).toString('base64')}`
      }
    }
  }
  await visit('')
  return entries
}

export async function expectPreviewUnchanged(root: string, options: Parameters<typeof resolveUpgradePlan>[0] = {}) {
  const before = await snapshotWorkspace(root)
  const plan = await resolveUpgradePlan({ cwd: root, yes: true, ...options })
  expect(await snapshotWorkspace(root)).toEqual(before)
  return plan
}

export async function packageNames(root: string) {
  clearWorkspaceCache()
  return (await getWorkspacePackages(root, { ignorePrivatePackage: false })).map(pkg => pkg.manifest.name).sort()
}

export async function expectLegacyState(root: string, hasPre: boolean) {
  expect(await readFile(path.join(root, '.changeset/config.json'), 'utf8')).toBe('{"changelog":false}\n')
  if (hasPre) {
    expect(await readFile(path.join(root, '.changeset/pre.json'), 'utf8')).toBe('{"mode":"pre","tag":"beta"}\n')
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  expect(manifest.devDependencies['@changesets/cli']).toBe('^2.0.0')
}

export async function expectLegacyRemoved(root: string) {
  for (const file of ['.changeset/config.json', '.changeset/pre.json']) {
    await expect(readFile(path.join(root, file))).rejects.toMatchObject({ code: 'ENOENT' })
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  expect(manifest.devDependencies?.['@changesets/cli']).toBeUndefined()
}
