import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { classifyReleaseWorkflow, migrateLegacyVersioning, planLegacyVersioning } from '@/commands/upgrade/release-migration'
import fs from '@/utils/fs'

const roots: string[] = []

async function createWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), 'release-migration-'))
  roots.push(root)
  await fs.ensureDir(path.join(root, '.github/workflows'))
  await fs.ensureDir(path.join(root, '.changeset'))
  await fs.ensureDir(path.join(root, 'packages/demo'))
  await fs.ensureDir(path.join(root, 'packages/private'))
  await fs.writeJSON(path.join(root, 'packages/demo/package.json'), { name: 'demo', version: '1.0.0' })
  await fs.writeJSON(path.join(root, 'packages/private/package.json'), { name: 'private-package', version: '1.0.0', private: true })
  await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\nversioning:\n  changelog:\n    storage: repository\n')
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('release migration', () => {
  it('classifies managed, legacy, and custom workflows', async () => {
    const root = await createWorkspace()
    const workflow = path.join(root, '.github/workflows/release.yml')

    await fs.writeFile(workflow, '# repoctl-managed: release/v2\nname: Release\n')
    await expect(classifyReleaseWorkflow(root)).resolves.toBe('managed')

    await fs.writeFile(workflow, 'uses: changesets/action\nwith:\n  publish-script: pnpm exec repo release stable\n')
    await expect(classifyReleaseWorkflow(root)).resolves.toBe('legacy')

    await fs.writeFile(workflow, 'name: custom\njobs: {}\n')
    await expect(classifyReleaseWorkflow(root)).resolves.toBe('custom')
  })

  it('requires the managed marker to be a standalone comment line', async () => {
    const root = await createWorkspace()
    const workflow = path.join(root, '.github/workflows/release.yml')

    await fs.writeFile(workflow, [
      'name: custom',
      'jobs:',
      '  build:',
      '    steps:',
      '      - run: "echo # repoctl-managed: release/v2"',
      '',
    ].join('\n'))

    await expect(classifyReleaseWorkflow(root)).resolves.toBe('custom')
  })

  it('does not treat a marker inside a block scalar as managed metadata', async () => {
    const root = await createWorkspace()
    const workflow = path.join(root, '.github/workflows/release.yml')

    await fs.writeFile(workflow, [
      'name: custom',
      'jobs:',
      '  release:',
      '    steps:',
      '      - run: |',
      '          # repoctl-managed: release/v2',
      '          echo custom',
      '',
    ].join('\n'))

    await expect(classifyReleaseWorkflow(root)).resolves.toBe('custom')
  })

  it('does not classify comments that mention legacy release commands', async () => {
    const root = await createWorkspace()
    const workflow = path.join(root, '.github/workflows/release.yml')

    await fs.writeFile(workflow, [
      'name: custom',
      'jobs:',
      '  release:',
      '    steps:',
      '      - uses: changesets/action@v1',
      '      - run: echo "changesets/action changeset publish"',
      '',
    ].join('\n'))

    await expect(classifyReleaseWorkflow(root)).resolves.toBe('custom')
  })

  it('recognizes sequence steps and Changesets action publish inputs', async () => {
    const root = await createWorkspace()
    const workflow = path.join(root, '.github/workflows/release.yml')

    await fs.writeFile(workflow, [
      'name: Release',
      'jobs:',
      '  release:',
      '    steps:',
      '      - uses: changesets/action@v1',
      '        with:',
      '          publish: pnpm changeset publish',
      '',
    ].join('\n'))
    await expect(classifyReleaseWorkflow(root)).resolves.toBe('legacy')

    await fs.writeFile(workflow, [
      'name: Release',
      'jobs:',
      '  release:',
      '    steps:',
      '      - uses: changesets/action@v1',
      '      - run: pnpm changeset version',
      '',
    ].join('\n'))
    await expect(classifyReleaseWorkflow(root)).resolves.toBe('legacy')
  })

  it('recognizes quoted, inline, and block-scalar release commands', async () => {
    const root = await createWorkspace()
    const workflow = path.join(root, '.github/workflows/release.yml')

    await fs.writeFile(workflow, [
      'name: Release',
      'jobs:',
      '  release:',
      '    steps:',
      '      - { uses: "changesets/action@v1", with: { publish: "pnpm changeset publish" } }',
      '',
    ].join('\n'))
    await expect(classifyReleaseWorkflow(root)).resolves.toBe('legacy')

    await fs.writeFile(workflow, [
      'name: Release',
      'jobs:',
      '  release:',
      '    steps:',
      '      - uses: changesets/action@v1',
      '      - run: |',
      '          pnpm changeset version',
      '          pnpm changeset publish',
      '',
    ].join('\n'))
    await expect(classifyReleaseWorkflow(root)).resolves.toBe('legacy')
  })

  it('keeps shell strings that only mention a Changesets command custom', async () => {
    const root = await createWorkspace()
    const workflow = path.join(root, '.github/workflows/release.yml')

    await fs.writeFile(workflow, [
      'name: Release',
      'jobs:',
      '  release:',
      '    steps:',
      '      - uses: changesets/action@v1',
      '        with:',
      '          publish: echo "pnpm changeset publish"',
      '',
    ].join('\n'))
    await expect(classifyReleaseWorkflow(root)).resolves.toBe('custom')
  })

  it('keeps a custom publish-script value outside the legacy release commands', async () => {
    const root = await createWorkspace()
    const workflow = path.join(root, '.github/workflows/release.yml')

    await fs.writeFile(workflow, [
      'name: Release',
      'jobs:',
      '  release:',
      '    steps:',
      '      - uses: changesets/action@v1',
      '        with:',
      '          publish-script: echo custom',
      '',
    ].join('\n'))

    await expect(classifyReleaseWorkflow(root)).resolves.toBe('custom')
  })

  it('converts Changesets prerelease state into lanes and removes old metadata', async () => {
    const root = await createWorkspace()
    await fs.writeJSON(path.join(root, '.changeset/pre.json'), { mode: 'pre', tag: 'beta' })
    await fs.writeJSON(path.join(root, '.changeset/config.json'), { changelog: ['legacy', {}] })

    await expect(migrateLegacyVersioning(root)).resolves.toEqual({ migratedLane: true })

    const workspace = await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')
    expect(workspace).toContain('lanes:')
    expect(workspace).toContain('demo: beta')
    expect(workspace).not.toContain('private-package: beta')
    await expect(fs.pathExists(path.join(root, '.changeset/pre.json'))).resolves.toBe(false)
    await expect(fs.pathExists(path.join(root, '.changeset/config.json'))).resolves.toBe(false)
  })

  it.each([
    'packages:\n  - packages/[\n',
    'packages:\n  - 42\n',
  ])('blocks migration when workspace package patterns are invalid: %j', async (workspaceContent) => {
    const root = await createWorkspace()
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), workspaceContent)
    await fs.writeJSON(path.join(root, '.changeset/pre.json'), { mode: 'pre', tag: 'beta' })

    await expect(planLegacyVersioning(root)).resolves.toMatchObject({
      migratedLane: false,
      blocked: 'invalid-workspace-patterns',
      remove: [],
    })
    await expect(migrateLegacyVersioning(root)).resolves.toEqual({ migratedLane: false })
    await expect(fs.pathExists(path.join(root, '.changeset/pre.json'))).resolves.toBe(true)
  })
})
