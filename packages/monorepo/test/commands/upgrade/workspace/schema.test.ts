import { upgradeMonorepo } from '@icebreakers/monorepo'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import { describe, expect, it } from 'vitest'
import {
  allPackageNames,
  catalogOn,
  createWorkspace,
  expectPreviewUnchanged,
  implicitMerge,
  packageNames,
  registerFixtureCleanup,
  snapshotWorkspace,
} from './fixtures'

registerFixtureCleanup()

describe('built upgrades retain pnpm workspace YAML semantics', () => {
  it.each([
    ['YAML 1.1 package names', '%YAML 1.1\n---\npackages: [on]\n'],
    ['YAML 1.1 catalog dist tags', catalogOn],
    ['YAML 1.1 metadata', '%YAML 1.1\n---\npackages: [apps/*]\nmetadata: { enabled: yes, count: 010, time: 1:20, date: 2026-01-01 }\n'],
    ['explicit integers', 'packages: [apps/*]\nmetadata: { binary: !!int 0b10, negative: !!int -0b11, decimal: !!int 42 }\n'],
  ])('preserves %s according to the actual pnpm reader', async (_name, source) => {
    const root = await createWorkspace(source)
    const expected = await readWorkspaceManifest(root)
    const originalPackages = await packageNames(root)
    await expectPreviewUnchanged(root)

    await upgradeMonorepo({ cwd: root, yes: true })

    const upgraded = await readWorkspaceManifest(root)
    expect(upgraded).toBeDefined()
    for (const [key, value] of Object.entries(expected!)) {
      if (key === 'packages') {
        expect(upgraded!.packages).toEqual(expect.arrayContaining(value))
      }
      else {
        expect(upgraded).toHaveProperty(key, value)
      }
    }
    expect(await packageNames(root)).toEqual(expect.arrayContaining(originalPackages))

    const firstUpgrade = await snapshotWorkspace(root)
    await expectPreviewUnchanged(root)
    await upgradeMonorepo({ cwd: root, yes: true })
    expect(await snapshotWorkspace(root)).toEqual(firstUpgrade)
  })

  it('preserves implicit discovery and an ordinary merge field in an existing manifest', async () => {
    const root = await createWorkspace(implicitMerge)
    const expected = await readWorkspaceManifest(root)
    expect(expected?.packages).toBeUndefined()
    expect(await packageNames(root)).toEqual(allPackageNames)
    await expectPreviewUnchanged(root)

    await upgradeMonorepo({ cwd: root, yes: true })

    const upgraded = await readWorkspaceManifest(root)
    expect(upgraded?.packages).toBeUndefined()
    expect(upgraded).toMatchObject(expected!)
    expect(await packageNames(root)).toEqual(allPackageNames)
    const firstUpgrade = await snapshotWorkspace(root)
    await upgradeMonorepo({ cwd: root, yes: true })
    expect(await snapshotWorkspace(root)).toEqual(firstUpgrade)
  })

  it.each(['null\n', '{}\n'])('preserves implicit discovery for an existing %j document', async (source) => {
    const root = await createWorkspace(source)
    expect(await packageNames(root)).toEqual(allPackageNames)
    await expectPreviewUnchanged(root)

    await upgradeMonorepo({ cwd: root, yes: true })

    expect((await readWorkspaceManifest(root))?.packages).toBeUndefined()
    expect(await packageNames(root)).toEqual(allPackageNames)
    const firstUpgrade = await snapshotWorkspace(root)
    await upgradeMonorepo({ cwd: root, yes: true })
    expect(await snapshotWorkspace(root)).toEqual(firstUpgrade)
  })
})
