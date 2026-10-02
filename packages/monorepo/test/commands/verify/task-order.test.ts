import type { Buffer } from 'node:buffer'
import type { spawnSync, SpawnSyncOptions, SpawnSyncReturns } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { verifyPrePush } from '@icebreakers/monorepo'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allScripts, cleanupGitWorkspaces, createGitWorkspace, createTaskRecorder, expectSnapshotCleanup, pushInput } from './fixtures'

afterEach(cleanupGitWorkspaces)

describe('pre-push task coverage', () => {
  it('builds workspace dependencies before a lexically earlier dependent package', async () => {
    const fixture = createGitWorkspace({ rootScripts: {} })
    fixture.addPackage('modules/a')
    fixture.addPackage('modules/b')
    fixture.write('modules/a/package.json', JSON.stringify({
      name: 'fixture-a',
      private: true,
      dependencies: { 'fixture-b': 'workspace:*' },
      scripts: allScripts,
    }))
    fixture.write('modules/b/package.json', JSON.stringify({
      name: 'fixture-b',
      private: true,
      scripts: allScripts,
    }))
    const base = fixture.commit()
    fixture.write('modules/a/src/index.ts', 'export const value = 2\n')
    fixture.write('modules/b/src/index.ts', 'export const value = 2\n')
    const recorder = createTaskRecorder()

    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(fixture.commit(), base), spawn: recorder.spawn })

    expect(recorder.installCalls).toEqual([['install', '--frozen-lockfile']])
    expect(recorder.invocations[0]!.args).toEqual(recorder.installCalls[0])
    expect(recorder.calls.slice(0, 2)).toEqual([
      ['--dir', 'modules/b', 'build'],
      ['--dir', 'modules/a', 'build'],
    ])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('builds an unchanged upstream package when a changed dependent has no local dist', async () => {
    const fixture = createGitWorkspace({ rootScripts: {} })
    fixture.addPackage('modules/a')
    fixture.addPackage('modules/b')
    fixture.write('modules/a/package.json', JSON.stringify({
      name: 'fixture-a',
      private: true,
      dependencies: { 'fixture-b': 'workspace:*' },
      scripts: allScripts,
    }))
    fixture.write('modules/b/package.json', JSON.stringify({
      name: 'fixture-b',
      private: true,
      scripts: allScripts,
    }))
    const base = fixture.commit()
    fixture.write('modules/a/src/index.ts', 'export const value = 2\n')
    const recorder = createTaskRecorder()
    expect(fs.existsSync(path.join(fixture.cwd, 'modules/b', 'dist'))).toBe(false)

    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(fixture.commit(), base), spawn: recorder.spawn })

    expect(recorder.installCalls).toEqual([['install', '--frozen-lockfile']])
    expect(recorder.invocations[0]!.args).toEqual(recorder.installCalls[0])
    expect(recorder.calls.slice(0, 2)).toEqual([
      ['--dir', 'modules/b', 'build'],
      ['--dir', 'modules/a', 'build'],
    ])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('falls back to package scripts for root phases without root scripts', async () => {
    const fixture = createGitWorkspace({ rootScripts: {} })
    fixture.addPackage('services/api')
    fixture.addPackage('modules/widget', { ...allScripts, tsd: '' })
    const recorder = createTaskRecorder()

    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(fixture.commit()), spawn: recorder.spawn })

    expect(recorder.calls).toEqual([
      ['--dir', 'modules/widget', 'build'],
      ['--dir', 'services/api', 'build'],
      ['--dir', 'modules/widget', 'lint'],
      ['--dir', 'services/api', 'lint'],
      ['--dir', 'modules/widget', 'typecheck'],
      ['--dir', 'services/api', 'typecheck'],
      ['--dir', 'services/api', 'tsd'],
      ['--dir', 'modules/widget', 'test'],
      ['--dir', 'services/api', 'test'],
    ])
    expect(recorder.installCalls).toEqual([])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('checks the remaining workspace when a complete package is deleted', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    fixture.addPackage('modules/removed')
    const base = fixture.commit()
    fs.rmSync(path.join(fixture.cwd, 'modules/removed'), { recursive: true })
    const recorder = createTaskRecorder()

    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(fixture.commit(), base), spawn: recorder.spawn })

    expect(recorder.calls).toEqual([['build'], ['lint'], ['typecheck'], ['tsd'], ['test']])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('skips unavailable package scripts and keeps remaining phases ordered', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api', { ...allScripts, build: '', tsd: '' })
    const base = fixture.commit()
    fixture.write('services/api/src/index.ts', 'export const value = 2\n')
    const recorder = createTaskRecorder()

    await verifyPrePush({ cwd: fixture.cwd, stdinText: pushInput(fixture.commit(), base), spawn: recorder.spawn })

    expect(recorder.calls).toEqual([['lint'], ['typecheck'], ['--dir', 'services/api', 'test']])
    expectSnapshotCleanup(recorder, fixture.cwd)
  })

  it('stops before lint and tests when the build fails', async () => {
    const fixture = createGitWorkspace()
    fixture.addPackage('services/api')
    const base = fixture.commit()
    fixture.write('services/api/src/index.ts', 'export const value = 2\n')
    let snapshotCwd: string | undefined
    const spawn = vi.fn((_command: string, _args: string[], options: SpawnSyncOptions) => {
      snapshotCwd = String(options.cwd)
      expect(fs.existsSync(path.join(snapshotCwd, 'services/api/src/index.ts'))).toBe(true)
      return { status: 7 } as SpawnSyncReturns<Buffer>
    })
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('verification exited')
    })

    try {
      await expect(verifyPrePush({
        cwd: fixture.cwd,
        stdinText: pushInput(fixture.commit(), base),
        spawn: spawn as unknown as typeof spawnSync,
      })).rejects.toThrow('verification exited')
      expect(exit).toHaveBeenCalledWith(7)
      expect(spawn.mock.calls).toEqual([
        ['pnpm', ['--dir', 'services/api', 'build'], expect.objectContaining({ cwd: expect.any(String) })],
      ])
      expect(snapshotCwd).toBeDefined()
      expect(snapshotCwd).not.toBe(fixture.cwd)
      expect(fs.existsSync(snapshotCwd!)).toBe(false)
    }
    finally {
      exit.mockRestore()
    }
  })
})
