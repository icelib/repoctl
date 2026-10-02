import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verifyPrePush } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupGitWorkspaces, createGitWorkspace, createTaskRecorder, expectedTasks, expectSnapshotCleanup, pushInput } from './fixtures'

const aliasRoots: string[] = []

afterEach(() => {
  for (const root of aliasRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  cleanupGitWorkspaces()
})

function createAlias(target: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repoctl-verify-alias-'))
  aliasRoots.push(root)
  const alias = path.join(root, 'workspace')
  fs.symlinkSync(target, alias, 'junction')
  return alias
}

describe('built pre-push workspace path aliases', () => {
  it.each(['physical', 'alias', 'relative'] as const)('uses %s explicit workspace paths from an aliased cwd', async (kind) => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    const alias = createAlias(fixture.cwd)
    const base = fixture.commit()
    fixture.write('services/api/src/index.ts', 'export const value = 2\n')
    const workspaces = kind === 'physical'
      ? [path.join(fixture.cwd, 'services/api')]
      : kind === 'alias'
        ? [path.join(alias, 'services/api')]
        : ['services/api']
    const recorder = createTaskRecorder()

    await verifyPrePush({ cwd: alias, workspaces, stdinText: pushInput(fixture.commit(), base), spawn: recorder.spawn })

    expect(recorder.calls).toEqual(expectedTasks(['services/api']))
    expect(recorder.installCalls).toEqual([])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('uses an absolute alias workspace path from a physical cwd', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    const alias = createAlias(fixture.cwd)
    const base = fixture.commit()
    fixture.write('services/api/src/index.ts', 'export const value = 2\n')
    const recorder = createTaskRecorder()

    await verifyPrePush({
      cwd: fixture.cwd,
      workspaces: [path.join(alias, 'services/api')],
      stdinText: pushInput(fixture.commit(), base),
      spawn: recorder.spawn,
    })

    expect(recorder.calls).toEqual(expectedTasks(['services/api']))
    expect(recorder.installCalls).toEqual([])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('resolves a relative symlink to its tracked package path', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    const alias = createAlias(fixture.cwd)
    const base = fixture.commit()
    fixture.write('services/api/src/index.ts', 'export const value = 2\n')
    const head = fixture.commit()
    // The link is an input alias, not a file included in the pushed commits.
    fs.symlinkSync(path.join(fixture.cwd, 'services/api'), path.join(fixture.cwd, 'shortcut'), 'junction')
    const recorder = createTaskRecorder()

    await verifyPrePush({ cwd: alias, workspaces: ['shortcut'], stdinText: pushInput(head, base), spawn: recorder.spawn })

    expect(recorder.calls).toEqual(expectedTasks(['services/api']))
    expect(recorder.installCalls).toEqual([])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('deduplicates workspace aliases using longest ownership', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('modules/parent')
    fixture.addPackage('modules/parent/child')
    const alias = createAlias(fixture.cwd)
    const base = fixture.commit()
    fixture.write('modules/parent/child/src/index.ts', 'export const value = 2\n')
    const head = fixture.commit()
    const recorder = createTaskRecorder()

    await verifyPrePush({
      cwd: alias,
      workspaces: [
        'modules/parent',
        'modules/parent/child',
        path.join(fixture.cwd, 'modules/parent/child'),
        `${path.join(alias, 'modules/parent/child')}${path.sep}`,
      ],
      stdinText: pushInput(head, base),
      spawn: recorder.spawn,
    })

    expect(recorder.calls).toEqual(expectedTasks(['modules/parent/child']))
    expect(recorder.installCalls).toEqual([])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('retains ownership of a deleted package reached through an alias', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('modules/deleted/nested')
    const alias = createAlias(fixture.cwd)
    const base = fixture.commit()
    fs.rmSync(path.join(fixture.cwd, 'modules/deleted'), { recursive: true })
    const recorder = createTaskRecorder()

    await verifyPrePush({
      cwd: fixture.cwd,
      workspaces: [path.join(alias, 'modules/deleted/nested')],
      stdinText: pushInput(fixture.commit(), base),
      spawn: recorder.spawn,
    })

    // The deleted package has no scripts left to run. Its deleted manifest
    // must not be mistaken for a root change and trigger every root task.
    expect(recorder.calls).toEqual([['lint'], ['typecheck']])
    expect(recorder.installCalls).toEqual([])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('excludes physical paths outside cwd even when a relative symlink points to them', async () => {
    const fixture = createGitWorkspace({ rootScripts: {} })
    const outside = createGitWorkspace()
    fixture.addPackage('services/api')
    outside.addPackage('modules/outside')
    const base = fixture.commit()
    fixture.write('services/api/src/index.ts', 'export const value = 2\n')
    const head = fixture.commit()
    const outsidePackage = path.join(outside.cwd, 'modules/outside')
    fs.symlinkSync(outsidePackage, path.join(fixture.cwd, 'outside-link'), 'junction')
    const recorder = createTaskRecorder()

    await verifyPrePush({
      cwd: fixture.cwd,
      workspaces: ['services/api', outsidePackage, 'outside-link'],
      stdinText: pushInput(head, base),
      spawn: recorder.spawn,
    })

    expect(recorder.calls).toEqual(['build', 'lint', 'typecheck', 'tsd', 'test'].map(task => ['--dir', 'services/api', task]))
    expect(recorder.installCalls).toEqual([])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('keeps an explicit cwd as the task base without climbing to its parent workspace', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('modules/parent')
    fixture.addPackage('modules/parent/child')
    const alias = createAlias(path.join(fixture.cwd, 'modules/parent'))
    const base = fixture.commit()
    fixture.write('modules/parent/child/src/index.ts', 'export const value = 2\n')
    const recorder = createTaskRecorder()

    await verifyPrePush({
      cwd: alias,
      workspaces: [path.join(fixture.cwd, 'modules/parent/child')],
      stdinText: pushInput(fixture.commit(), base),
      spawn: recorder.spawn,
    })

    expect(recorder.calls).toEqual(expectedTasks(['child']))
    expect(recorder.installCalls).toEqual([])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })
})
