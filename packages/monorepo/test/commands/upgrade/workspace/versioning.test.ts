import { Buffer } from 'node:buffer'
import { load } from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateLegacyVersioning, planLegacyVersioning } from '@/commands/upgrade/release-migration'
import { clearWorkspaceCache } from '@/core/workspace'
import { allPackageNames, createWorkspace, registerFixtureCleanup, snapshotWorkspace } from './fixtures'

registerFixtureCleanup()
afterEach(() => clearWorkspaceCache())

describe('release planning validates the complete candidate workspace', () => {
  it.each([
    ['packages: [apps/*]\ncatalogs: { modern: null }\n', 'invalid-workspace-manifest'],
    ['packages: [apps/*]\ncustom: !!timestamp 2026-01-01\n', 'invalid-workspace-manifest'],
    ['packages: [42]\n', 'invalid-workspace-patterns'],
    ['packages: ["["]\n', 'invalid-workspace-patterns'],
  ])('keeps config-only state when the workspace is invalid: %s', async (source, reason) => {
    const root = await createWorkspace(source, { legacy: 'config' })
    const before = await snapshotWorkspace(root)

    await expect(planLegacyVersioning(root)).resolves.toMatchObject({ migratedLane: false, blocked: reason, remove: [] })
    await expect(migrateLegacyVersioning(root)).resolves.toEqual({ migratedLane: false })

    expect(await snapshotWorkspace(root)).toEqual(before)
  })

  it('uses implicit patterns from the candidate instead of reading old disk rules', async () => {
    const root = await createWorkspace('packages: []\n', { legacy: 'pre' })
    const before = await snapshotWorkspace(root)

    const plan = await planLegacyVersioning(root, Buffer.from('catalog: {}\n'))

    expect(plan.blocked).toBeUndefined()
    expect(plan.migratedLane).toBe(true)
    expect(load(plan.workspaceContent!.toString('utf8'))).toMatchObject({
      catalog: {},
      versioning: { lanes: Object.fromEntries(allPackageNames.map(name => [name, 'beta'])) },
    })
    expect(await snapshotWorkspace(root)).toEqual(before)
  })

  it('retains an explicitly empty candidate selection', async () => {
    const root = await createWorkspace('catalog: {}\n', { legacy: 'pre' })
    const before = await snapshotWorkspace(root)

    const plan = await planLegacyVersioning(root, Buffer.from('packages: []\n'))

    expect(plan.blocked).toBeUndefined()
    expect(load(plan.workspaceContent!.toString('utf8'))).toMatchObject({ packages: [], versioning: { lanes: {} } })
    expect(await snapshotWorkspace(root)).toEqual(before)
  })

  it('updates aliased versioning values without changing their other uses', async () => {
    const source = 'packages: [on]\nshared: &state { lanes: { existing: beta } }\nversioning: *state\notherState: *state\n'
    const root = await createWorkspace(source, { legacy: 'pre' })
    const before = await snapshotWorkspace(root)

    const plan = await planLegacyVersioning(root)

    expect(plan.blocked).toBeUndefined()
    expect(load(plan.workspaceContent!.toString('utf8'))).toMatchObject({
      shared: { lanes: { existing: 'beta' } },
      otherState: { lanes: { existing: 'beta' } },
      versioning: { lanes: { 'existing': 'beta', 'on-package': 'beta' } },
    })
    expect(await snapshotWorkspace(root)).toEqual(before)
  })
})
