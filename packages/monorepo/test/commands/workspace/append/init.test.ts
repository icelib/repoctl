import { initMetadata } from '@icebreakers/monorepo'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import { describe, expect, it } from 'vitest'
import {
  appendCases,
  createWorkspace,
  defaults,
  expectCommentsPreserved,
  noOpCases,
  readManifestContent,
  registerFixtureCleanup,
  snapshotWorkspace,
} from './fixtures'

registerFixtureCleanup()

describe('built init appends workspace rules without changing shared YAML values', () => {
  it.each(appendCases)('isolates $name', async ({ source }) => {
    const root = await createWorkspace(source)
    const expected = await readWorkspaceManifest(root)
    expect(expected?.packages).toEqual(['modules/*'])

    await initMetadata(root)

    // pnpm independently checks duplicate mapping keys, valid anchor uses,
    // package rules, and every unrelated value after the document is edited.
    expect(await readWorkspaceManifest(root)).toEqual({
      ...expected,
      packages: ['modules/*', ...defaults],
    })
    await expectCommentsPreserved(root, source)
    const initialized = await snapshotWorkspace(root)
    await initMetadata(root)
    expect(await snapshotWorkspace(root)).toEqual(initialized)
  })

  it.each(noOpCases)('retains the exact source for $name', async ({ source }) => {
    const root = await createWorkspace(source)
    const expected = await readWorkspaceManifest(root)

    await initMetadata(root)

    expect(await readManifestContent(root)).toBe(source)
    expect(await readWorkspaceManifest(root)).toEqual(expected)
    const initialized = await snapshotWorkspace(root)
    await initMetadata(root)
    expect(await snapshotWorkspace(root)).toEqual(initialized)
  })
})
