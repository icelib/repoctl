import { createNewProject, getWorkspacePackages, resolveCreateNewProjectPlan } from '@icebreakers/monorepo'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import { describe, expect, it } from 'vitest'
import {
  appendCases,
  createWorkspace,
  expectCommentsPreserved,
  noOpCases,
  readManifestContent,
  registerFixtureCleanup,
  snapshotWorkspace,
} from './fixtures'

registerFixtureCleanup()

describe('built create appends workspace rules without changing shared YAML values', () => {
  it.each(appendCases)('isolates $name while keeping previews read-only', async ({ source }) => {
    const root = await createWorkspace(source)
    const expected = await readWorkspaceManifest(root)
    expect(expected?.packages).toEqual(['modules/*'])
    const options = { cwd: root, name: 'services/new', type: 'tsdown' }
    const before = await snapshotWorkspace(root)

    const plan = await resolveCreateNewProjectPlan(options)

    expect(plan.workspaceManifest).toMatchObject({ changed: true, pattern: 'services/new' })
    expect(await snapshotWorkspace(root)).toEqual(before)
    await createNewProject(options)

    // A duplicate alias key or a dangling anchor must fail pnpm's real reader.
    expect(await readWorkspaceManifest(root)).toEqual({
      ...expected,
      packages: ['modules/*', 'services/new'],
    })
    await expectCommentsPreserved(root, source)
    expect((await getWorkspacePackages(root, { ignorePrivatePackage: false })).map(pkg => pkg.manifest.name).sort()).toEqual(['fixture-api', 'new'])
    const created = await snapshotWorkspace(root)
    expect((await resolveCreateNewProjectPlan(options)).workspaceManifest.changed).toBe(false)
    expect(await snapshotWorkspace(root)).toEqual(created)
  })

  it.each(noOpCases)('retains the exact source for $name', async ({ source }) => {
    const root = await createWorkspace(source)
    const expected = await readWorkspaceManifest(root)
    const options = { cwd: root, name: 'apps/new', type: 'tsdown' }
    const before = await snapshotWorkspace(root)

    expect((await resolveCreateNewProjectPlan(options)).workspaceManifest.changed).toBe(false)
    expect(await snapshotWorkspace(root)).toEqual(before)
    await createNewProject(options)

    expect(await readManifestContent(root)).toBe(source)
    expect(await readWorkspaceManifest(root)).toEqual(expected)
    const created = await snapshotWorkspace(root)
    expect((await resolveCreateNewProjectPlan(options)).workspaceManifest.changed).toBe(false)
    expect(await snapshotWorkspace(root)).toEqual(created)
  })
})
