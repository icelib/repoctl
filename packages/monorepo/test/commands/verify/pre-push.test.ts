import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { verifyPrePush } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupGitWorkspaces, createGitWorkspace, createTaskRecorder, expectedTasks, expectSnapshotCleanup, pushInput, zeroSha } from './fixtures'

afterEach(cleanupGitWorkspaces)

describe('built pre-push public API with real Git changes', () => {
  it('discovers private consumer packages and runs phases in order', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    fixture.addPackage('modules/widget')
    const base = fixture.commit()
    fixture.write('services/api/src/index.ts', 'export const value = 2\n')
    fixture.write('modules/widget/src/index.ts', 'export const value = 2\n')
    const recorder = createTaskRecorder()

    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(fixture.commit(), base), spawn: recorder.spawn })

    expect(recorder.calls).toEqual(expectedTasks(['modules/widget', 'services/api']))
    expect(recorder.installCalls).toEqual([])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('includes deleted files and both sides of a rename across packages', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    fixture.addPackage('modules/widget')
    fixture.addPackage('modules/legacy')
    const base = fixture.commit()
    fixture.git('mv', 'services/api/src/index.ts', 'modules/widget/src/moved.ts')
    fs.rmSync(path.join(fixture.cwd, 'modules/legacy/src/index.ts'))
    const recorder = createTaskRecorder()

    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(fixture.commit(), base), spawn: recorder.spawn })

    expect(recorder.calls).toEqual(expectedTasks(['modules/legacy', 'modules/widget', 'services/api']))
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it.each([
    'modules/space dir',
    'modules/中文',
    ...(process.platform === 'win32' ? [] : ['modules/line\nbreak']),
  ])('preserves Git path bytes for %j', async (dir) => {
    const fixture = createGitWorkspace()
    fixture.addPackage(dir)
    const base = fixture.commit()
    fixture.write(`${dir}/src/index.ts`, 'export const value = 2\n')
    const recorder = createTaskRecorder()

    await verifyPrePush({
      cwd: fixture.cwd,
      stdinText: pushInput(fixture.commit(), base),
      // pnpm's globstar discovery does not match newline directory names.
      // Explicit ownership still needs to preserve their exact Git paths.
      ...(dir.includes('\n') ? { workspaces: [dir] } : {}),
      spawn: recorder.spawn,
    })

    expect(recorder.calls).toEqual(expectedTasks([dir]))
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it.each([
    'space name.ts',
    '中文.ts',
    ...(process.platform === 'win32' ? [] : ['line\nbreak.ts']),
  ])('handles %j within an automatically discovered workspace', async (filename) => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    const base = fixture.commit()
    fixture.write(`services/api/src/${filename}`, 'export const value = 2\n')
    const recorder = createTaskRecorder()

    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(fixture.commit(), base), spawn: recorder.spawn })

    expect(recorder.calls).toEqual(expectedTasks(['services/api']))
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('selects the longest package path even when explicit workspaces list parents first', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('modules/parent')
    fixture.addPackage('modules/parent/child')
    const base = fixture.commit()
    fixture.write('modules/parent/child/src/index.ts', 'export const value = 2\n')
    const recorder = createTaskRecorder()

    await verifyPrePush({
      cwd: fixture.cwd,
      stdinText: pushInput(fixture.commit(), base),
      workspaces: ['./modules/parent/', 'modules/parent/child', 'modules/parent/child/'],
      spawn: recorder.spawn,
    })

    expect(recorder.calls).toEqual(expectedTasks(['modules/parent/child']))
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('honors excluded packages and an explicitly empty workspace list', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('modules/excluded')
    fixture.addPackage('services/api')
    const base = fixture.commit()
    fixture.write('modules/excluded/src/index.ts', 'export const value = 2\n')
    const firstHead = fixture.commit()
    const recorder = createTaskRecorder()
    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(firstHead, base), spawn: recorder.spawn })
    expect(recorder.calls).toEqual([['lint'], ['typecheck']])
    expectSnapshotCleanup(recorder, fixture.cwd)

    fixture.write('services/api/src/index.ts', 'export const value = 2\n')
    recorder.calls.length = 0
    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(fixture.commit(), firstHead), workspaces: [], spawn: recorder.spawn })
    expect(recorder.calls).toEqual([['lint'], ['typecheck']])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('deduplicates shared phases across root changes and multiple refs', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    const base = fixture.commit()
    fixture.write('services/api/src/index.ts', 'export const value = 2\n')
    fixture.write('turbo.json', '{}\n')
    const input = pushInput(fixture.commit(), base)
    const recorder = createTaskRecorder()

    await verifyPrePush({ cwd: fixture.cwd, stdinText: `${input}\n${input}`, spawn: recorder.spawn })

    expect(recorder.calls).toEqual([['build'], ['lint'], ['typecheck'], ['tsd'], ['test']])
    expect(new Set(recorder.invocations.map(invocation => invocation.cwd)).size).toBe(1)
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('checks all tracked files for a new remote and ignores a deleted ref', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    const head = fixture.commit()
    const recorder = createTaskRecorder()
    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(head), spawn: recorder.spawn })
    expect(recorder.calls).toEqual([['build'], ['lint'], ['typecheck'], ['tsd'], ['test']])
    expectSnapshotCleanup(recorder, fixture.cwd)

    recorder.calls.length = 0
    recorder.invocations.length = 0
    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(zeroSha, head), spawn: recorder.spawn })
    expect(recorder.calls).toEqual([['lint'], ['typecheck']])
    expect(recorder.invocations.every(invocation => invocation.cwd === fixture.cwd)).toBe(true)
    expect(fs.existsSync(fixture.cwd)).toBe(true)
  })

  it('checks packages when a force push removes changes from the remote tree', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    const localHead = fixture.commit()
    fixture.write('services/api/src/index.ts', 'export const value = 2\n')
    const remoteHead = fixture.commit()
    fixture.git('reset', '--hard', localHead)
    const recorder = createTaskRecorder()

    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(localHead, remoteHead), spawn: recorder.spawn })

    expect(recorder.calls).toEqual(expectedTasks(['services/api']))
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('resolves the workspace root when invoked from a package', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    const base = fixture.commit()
    fixture.write('services/api/src/index.ts', 'export const value = 2\n')
    const recorder = createTaskRecorder()

    await verifyPrePush({ cwd: path.join(fixture.cwd, 'services/api'), stdinText: pushInput(fixture.commit(), base), spawn: recorder.spawn })

    expect(recorder.calls).toEqual(expectedTasks(['services/api']))
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('discovers newly added packages on repeated calls in the same process', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    const base = fixture.commit()
    const recorder = createTaskRecorder()
    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(base, base), spawn: recorder.spawn })
    recorder.calls.length = 0
    fixture.addPackage('modules/new-package')

    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(fixture.commit(), base), spawn: recorder.spawn })

    expect(recorder.calls).toEqual(expectedTasks(['modules/new-package']))
    expectSnapshotCleanup(recorder, fixture.cwd)
  })
})
