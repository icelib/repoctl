import type { CleanCommandConfig } from '@/types'
import { access, readFile, rm } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCleanFixture, snapshotTree } from './clean/fixture'

const checkboxMock = vi.hoisted(() => vi.fn())
const configMock = vi.hoisted(() => vi.fn<() => Promise<CleanCommandConfig>>())
const skillsMock = vi.hoisted(() => vi.fn(() => {
  throw new Error('Global skills must never be accessed')
}))
vi.mock('@icebreakers/monorepo-templates', async original => ({ ...await original<typeof import('@icebreakers/monorepo-templates')>(), checkbox: checkboxMock }))
vi.mock('@/core/config', () => ({ resolveCommandConfig: configMock }))
vi.mock('@/commands/skills', () => ({ getSkillTargetPaths: skillsMock }))

let fixture: Awaited<ReturnType<typeof createCleanFixture>>
beforeEach(async () => {
  fixture = await createCleanFixture()
  configMock.mockResolvedValue({})
  checkboxMock.mockReset()
  skillsMock.mockClear()
})
afterEach(async () => {
  expect(skillsMock).not.toHaveBeenCalled()
  await rm(fixture.root, { recursive: true, force: true })
})

describe('clean selection boundaries', () => {
  it('only deletes the checked workspace and preserves its existing repoctl version', async () => {
    const before = await snapshotTree(fixture.root)
    checkboxMock.mockResolvedValue([path.join(fixture.workspace, 'packages/a')])
    const { cleanProjects } = await import('@/commands/clean')
    await cleanProjects(fixture.workspace)
    await expect(access(path.join(fixture.workspace, 'packages/a'))).rejects.toThrow()
    const after = await snapshotTree(fixture.root)
    for (const [file, content] of Object.entries(before)) {
      if (!file.startsWith('workspace/packages/a/') && file !== 'workspace/package.json') {
        expect(after[file]).toBe(content)
      }
    }
    expect(JSON.parse(await readFile(path.join(fixture.workspace, 'package.json'), 'utf8')).devDependencies).toEqual({ repoctl: '^5.6.0', other: '^1.0.0' })
    expect(checkboxMock.mock.calls[0]?.[0].choices.every((choice: { checked: boolean }) => choice.checked === false)).toBe(true)
  })

  it.each(['empty', 'ExitPromptError', 'AbortPromptError'])('does not write on %s selection', async (mode) => {
    const before = await snapshotTree(fixture.root)
    if (mode === 'empty') {
      checkboxMock.mockResolvedValue([])
    }
    else {
      checkboxMock.mockRejectedValue(Object.assign(new Error('cancelled'), { name: mode }))
    }
    const { cleanProjects } = await import('@/commands/clean')
    await cleanProjects(fixture.workspace, { pinnedVersion: 'next' })
    expect(await snapshotTree(fixture.root)).toEqual(before)
  })

  it('propagates unexpected prompt errors without writes', async () => {
    const before = await snapshotTree(fixture.root)
    checkboxMock.mockRejectedValue(new Error('prompt failed'))
    const { cleanProjects } = await import('@/commands/clean')
    await expect(cleanProjects(fixture.workspace)).rejects.toThrow('prompt failed')
    expect(await snapshotTree(fixture.root)).toEqual(before)
  })

  it('keeps config filtering and ignores undefined overrides', async () => {
    configMock.mockResolvedValue({ autoConfirm: true, includePrivate: false, ignorePackages: ['pkg-a'] })
    const before = await snapshotTree(fixture.root)
    const { cleanProjects } = await import('@/commands/clean')
    // @ts-expect-error JavaScript callers can explicitly pass undefined overrides.
    await cleanProjects(fixture.workspace, { autoConfirm: undefined })
    expect(checkboxMock).not.toHaveBeenCalled()
    expect(await snapshotTree(fixture.root)).toEqual(before)
  })

  it('rejects a prompt result outside the available selection before any deletion', async () => {
    const before = await snapshotTree(fixture.root)
    checkboxMock.mockResolvedValue([path.join(fixture.workspace, 'packages/a'), fixture.home])
    const { cleanProjects } = await import('@/commands/clean')
    await expect(cleanProjects(fixture.workspace)).rejects.toThrow('unavailable workspace')
    expect(await snapshotTree(fixture.root)).toEqual(before)
  })
})
