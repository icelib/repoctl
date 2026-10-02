import { lstat, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createNewProject, getWorkspacePackages, init, initMetadata, resolveCreateNewProjectPlan, runDoctor } from '@icebreakers/monorepo'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from '@/utils/fs'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'repoctl-workspace-schema-'))
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

async function writePackage(directory: string, name: string) {
  await fs.outputJson(path.join(root, directory, 'package.json'), { name, version: '1.0.0' })
}

async function expectDoctorPackageCount(count: number) {
  const report = await runDoctor(root)
  expect(report.packageCount).toBe(count)
  expect(report.checks).toContainEqual(expect.objectContaining({ id: 'workspace-manifest', status: 'pass' }))
}

describe('built workspace commands use pnpm YAML core semantics', () => {
  it.each(['', '%YAML 1.1\n---\n', '%YAML 1.2\n---\n'])('treats a plain merge key as ordinary data with directive %j', async (directive) => {
    const original = `${directive}defaults: &rules\n  packages: [apps/**, "!apps/private/**"]\n<<: *rules # ordinary pnpm field\n`
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, original)
    await writePackage('', 'root')
    await writePackage('apps/public', 'public-app')
    await writePackage('apps/private/internal', 'private-app')
    await writePackage('modules/api', 'module-api')
    const before = await snapshotWorkspace()

    expect((await readWorkspaceManifest(root))?.packages).toBeUndefined()
    expect(await getWorkspacePackages(root, { ignorePrivatePackage: false })).toHaveLength(3)
    await expectDoctorPackageCount(3)
    for (const name of ['apps/private/new', 'services/new']) {
      expect((await resolveCreateNewProjectPlan({ cwd: root, name, type: 'tsdown' })).workspaceManifest.changed).toBe(false)
    }
    expect(await snapshotWorkspace()).toEqual(before)

    await initMetadata(root)
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(original)
    expect(await fs.readFile(path.join(root, 'README.md'), 'utf8')).toContain('[module-api](modules/api)')
    const initialized = await snapshotWorkspace()
    await initMetadata(root)
    expect(await snapshotWorkspace()).toEqual(initialized)

    await createNewProject({ cwd: root, name: 'apps/private/new', type: 'tsdown' })
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(original)
    expect(await getWorkspacePackages(root, { ignorePrivatePackage: false })).toHaveLength(4)
    await expectDoctorPackageCount(4)
  })

  it('preserves core scalar values, comments and anchors when appending under a YAML 1.1 directive', async () => {
    const original = [
      '%YAML 1.1',
      '---',
      'rules: &rules [yes, on, 1:20, 2026-01-01]',
      'packages: *rules # explicit package rules',
      'otherRules: *rules',
      'metadata: { enabled: yes, count: 010, time: 1:20, date: 2026-01-01 }',
      '',
    ].join('\n')
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, original)
    await writePackage('', 'root')
    // These names are valid directories on all supported platforms.
    await writePackage('yes', 'yes-package')
    await writePackage('on', 'on-package')
    await writePackage('2026-01-01', 'date-package')
    const expected = await readWorkspaceManifest(root)
    const before = await snapshotWorkspace()
    await expectDoctorPackageCount(3)
    const options = { cwd: root, name: 'services/new', type: 'tsdown' }
    expect((await resolveCreateNewProjectPlan(options)).workspaceManifest).toMatchObject({ changed: true, pattern: 'services/new' })
    expect(await snapshotWorkspace()).toEqual(before)

    await createNewProject(options)
    expect(await readWorkspaceManifest(root)).toEqual({ ...expected, packages: [...expected!.packages!, 'services/new'] })
    await expectDoctorPackageCount(4)

    await init(root, { tooling: [] })
    expect(await readWorkspaceManifest(root)).toEqual({
      ...expected,
      packages: [...expected!.packages!, 'services/new', 'apps/*', 'packages/*', 'examples/*'],
    })
    const content = await fs.readFile(manifestPath, 'utf8')
    expect(content).toContain('%YAML 1.1')
    expect(content).toContain('# explicit package rules')
    expect(content).toContain('&rules')
    expect(content).toContain('otherRules: *rules')
    const initialized = await snapshotWorkspace()
    await initMetadata(root)
    expect(await snapshotWorkspace()).toEqual(initialized)
  })

  it('uses an explicit package list even when a plain merge field declares other rules', async () => {
    const original = '%YAML 1.1\n---\ndefaults: &rules { packages: [apps/**] }\n<<: *rules\npackages: [modules/**, "!modules/private/**"]\n'
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), original)
    await writePackage('', 'root')
    await writePackage('apps/public', 'outside-package')
    await writePackage('modules/api', 'module-api')
    await expectDoctorPackageCount(1)
    const before = await snapshotWorkspace()

    await expect(resolveCreateNewProjectPlan({ cwd: root, name: 'modules/private/new', type: 'tsdown' })).rejects.toThrow('excluded')

    expect(await snapshotWorkspace()).toEqual(before)
    expect((await resolveCreateNewProjectPlan({ cwd: root, name: 'modules/new', type: 'tsdown' })).workspaceManifest.changed).toBe(false)
    expect(await snapshotWorkspace()).toEqual(before)
  })

  it.each(['', '%YAML 1.1\n---\n', '%YAML 1.3\n---\n'])('preserves pnpm-supported explicit integers with directive %j', async (directive) => {
    const original = `${directive}packages: [modules/*]\nmetadata: { binary: !!int 0b10, negative: !!int -0b11, decimal: !!int 42, hex: !!int 0xFF, plain: 0b10 }\n`
    const manifestPath = path.join(root, 'pnpm-workspace.yaml')
    await fs.writeFile(manifestPath, original)
    await writePackage('', 'root')
    const expected = await readWorkspaceManifest(root)
    expect(expected).toMatchObject({ metadata: { binary: 2, negative: -3, decimal: 42, hex: 255, plain: '0b10' } })
    await expectDoctorPackageCount(0)

    await createNewProject({ cwd: root, name: 'services/new', type: 'tsdown' })
    expect(await readWorkspaceManifest(root)).toEqual({ ...expected, packages: ['modules/*', 'services/new'] })

    await initMetadata(root)
    expect(await readWorkspaceManifest(root)).toEqual({
      ...expected,
      packages: ['modules/*', 'services/new', 'apps/*', 'packages/*', 'examples/*'],
    })
  })

  it.each([
    ['merge', 'defaults: &rules { packages: [apps/**] }\n!!merge <<: *rules\n'],
    ['merge with explicit rules', 'defaults: &rules { catalog: {} }\n!!merge <<: *rules\npackages: [apps/**]\n'],
    ['timestamp', 'packages: [apps/**]\ncustom: !!timestamp 2026-01-01\n'],
    ['binary', 'packages: [apps/**]\ncustom: !!binary YQ==\n'],
    ['set', 'packages: [apps/**]\ncustom: !!set { a: null }\n'],
    ['unknown sequence', 'packages: !custom [apps/**]\n'],
    ['unknown scalar', 'packages: [apps/**]\ncustom: !custom value\n'],
    ['invalid explicit integer', 'packages: [apps/**]\ncustom: !!int 0b102\n'],
  ])('rejects the non-core %s tag before writing and reports a stable diagnostic', async (_name, original) => {
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), original)
    await fs.writeFile(path.join(root, 'notes.txt'), 'keep user content\n')
    const before = await snapshotWorkspace()
    await expect(readWorkspaceManifest(root)).rejects.toThrow()

    const report = await runDoctor(root)
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'workspace-manifest', status: 'fail' }))
    expect(await snapshotWorkspace()).toEqual(before)
    for (const run of [
      () => initMetadata(root),
      () => init(root, { preset: 'minimal', yes: true }),
      () => resolveCreateNewProjectPlan({ cwd: root, name: 'apps/new', type: 'tsdown' }),
      () => createNewProject({ cwd: root, name: 'apps/new', type: 'tsdown' }),
    ]) {
      await expect(run()).rejects.toThrow('Invalid pnpm-workspace.yaml')
      expect(await snapshotWorkspace()).toEqual(before)
    }
  })
})
