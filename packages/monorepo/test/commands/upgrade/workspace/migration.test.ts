import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveUpgradePlan, upgradeMonorepo } from '@icebreakers/monorepo'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import { describe, expect, it } from 'vitest'
import {
  allPackageNames,
  catalogOn,
  createWorkspace,
  customWorkflow,
  expectLegacyRemoved,
  expectLegacyState,
  expectPreviewUnchanged,
  implicitMerge,
  invalidCatalog,
  packageNames,
  registerFixtureCleanup,
  snapshotWorkspace,
} from './fixtures'

registerFixtureCleanup()

describe('built release migration validates pnpm workspace semantics', () => {
  it('migrates all implicitly discovered packages before removing legacy release state', async () => {
    const root = await createWorkspace(implicitMerge, { legacy: 'pre' })
    expect(await packageNames(root)).toEqual(allPackageNames)
    const plan = await expectPreviewUnchanged(root)
    expect(plan.files).toContainEqual(expect.objectContaining({ path: '.changeset/pre.json', action: 'delete' }))

    await upgradeMonorepo({ cwd: root, yes: true })

    const upgraded = await readWorkspaceManifest(root)
    expect(upgraded?.packages).toBeUndefined()
    expect(upgraded).toHaveProperty('versioning.lanes', Object.fromEntries(allPackageNames.map(name => [name, 'beta'])))
    expect(await packageNames(root)).toEqual(allPackageNames)
    await expectLegacyRemoved(root)
    const migrated = await snapshotWorkspace(root)
    await upgradeMonorepo({ cwd: root, yes: true })
    expect(await snapshotWorkspace(root)).toEqual(migrated)
  })

  it.each(['config', 'pre'] as const)('rejects invalid catalogs without changing %s release state or any other file', async (legacy) => {
    const root = await createWorkspace(invalidCatalog, { legacy })
    const before = await snapshotWorkspace(root)
    await expect(readWorkspaceManifest(root)).rejects.toThrow()

    await expect(resolveUpgradePlan({ cwd: root, yes: true })).rejects.toThrow('Invalid pnpm-workspace.yaml')
    expect(await snapshotWorkspace(root)).toEqual(before)
    await expect(upgradeMonorepo({ cwd: root, yes: true })).rejects.toThrow('Invalid pnpm-workspace.yaml')

    expect(await snapshotWorkspace(root)).toEqual(before)
    await expectLegacyState(root, legacy === 'pre')
    expect(await readFile(path.join(root, '.github/workflows/release.yml'), 'utf8')).toContain('changesets/action')
  })

  it('allows no-overwrite to preserve an invalid workspace without changes', async () => {
    const root = await createWorkspace(invalidCatalog, { legacy: 'pre' })
    const before = await snapshotWorkspace(root)
    const plan = await expectPreviewUnchanged(root, { noOverwrite: true })
    expect(plan.files.every(file => file.action === 'skip')).toBe(true)

    await upgradeMonorepo({ cwd: root, yes: true, noOverwrite: true })

    expect(await snapshotWorkspace(root)).toEqual(before)
    await expectLegacyState(root, true)
  })

  it('preserves custom release state while retaining valid catalog dist tags during upgrade', async () => {
    const root = await createWorkspace(catalogOn, { legacy: 'pre', customRelease: true })
    const expected = await readWorkspaceManifest(root)
    const plan = await expectPreviewUnchanged(root)
    expect(plan.files).toContainEqual(expect.objectContaining({ path: '.github/workflows/release.yml', action: 'skip', reason: 'custom-release' }))
    for (const relativePath of ['.changeset/config.json', '.changeset/pre.json']) {
      expect(plan.files).toContainEqual(expect.objectContaining({ path: relativePath, action: 'skip' }))
    }

    await upgradeMonorepo({ cwd: root, yes: true })

    expect((await readWorkspaceManifest(root))?.catalog).toEqual(expected?.catalog)
    expect(await packageNames(root)).toContain('site-package')
    expect(await readFile(path.join(root, '.github/workflows/release.yml'), 'utf8')).toBe(customWorkflow)
    await expectLegacyState(root, true)
    const upgraded = await snapshotWorkspace(root)
    await upgradeMonorepo({ cwd: root, yes: true })
    expect(await snapshotWorkspace(root)).toEqual(upgraded)
  })

  it('can retry a rejected migration after the user repairs the catalog', async () => {
    const root = await createWorkspace(invalidCatalog, { legacy: 'pre' })
    const before = await snapshotWorkspace(root)
    await expect(resolveUpgradePlan({ cwd: root, yes: true })).rejects.toThrow('Invalid pnpm-workspace.yaml')
    await expect(upgradeMonorepo({ cwd: root, yes: true })).rejects.toThrow('Invalid pnpm-workspace.yaml')
    expect(await snapshotWorkspace(root)).toEqual(before)
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: [apps/*]\ncatalogs: { modern: { internal-tool: "on" } }\n')
    await expectPreviewUnchanged(root)

    await upgradeMonorepo({ cwd: root, yes: true })

    expect(await readWorkspaceManifest(root)).toMatchObject({
      catalogs: { modern: { 'internal-tool': 'on' } },
      versioning: { lanes: { 'site-package': 'beta' } },
    })
    expect(await packageNames(root)).toContain('site-package')
    await expectLegacyRemoved(root)
    const repaired = await snapshotWorkspace(root)
    await upgradeMonorepo({ cwd: root, yes: true })
    expect(await snapshotWorkspace(root)).toEqual(repaired)
  })
})
