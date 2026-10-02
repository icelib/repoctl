import type { Buffer } from 'node:buffer'
import type { spawnSync, SpawnSyncOptions, SpawnSyncReturns } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, vi } from 'vitest'

const temporaryRoots: string[] = []
export const allScripts = { build: 'echo build', lint: 'echo lint', typecheck: 'echo typecheck', tsd: 'echo tsd', test: 'echo test' }
export const zeroSha = '0'.repeat(40)

export function createGitWorkspace(options: { patterns?: string[], rootScripts?: Record<string, string> } = {}) {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repoctl-verify-')))
  temporaryRoots.push(cwd)
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
    fs.writeFileSync(path.join(cwd, file), content)
  }
  const git = (...args: string[]) => execFileSync('git', [
    '-c',
    'core.hooksPath=',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'user.name=repoctl-test',
    '-c',
    'user.email=test@example.invalid',
    ...args,
  ], { cwd, encoding: 'utf8' }).trim()
  git('init', '-q')
  write('package.json', JSON.stringify({ name: 'fixture-root', private: true, scripts: options.rootScripts ?? allScripts }))
  write('pnpm-workspace.yaml', `packages:\n${(options.patterns ?? ['services/**', 'modules/**', '!modules/excluded']).map(pattern => `  - ${JSON.stringify(pattern)}`).join('\n')}\n`)
  const addPackage = (dir: string, scripts = allScripts) => {
    write(`${dir}/package.json`, JSON.stringify({ name: `fixture-${dir.replaceAll(/\W/g, '-')}`, private: true, scripts }))
    write(`${dir}/src/index.ts`, 'export const value = 1\n')
  }
  const commit = () => {
    git('add', '-A')
    git('commit', '-qm', 'fixture')
    return git('rev-parse', 'HEAD')
  }
  return { cwd, write, git, addPackage, commit }
}

export function cleanupGitWorkspaces() {
  for (const cwd of temporaryRoots.splice(0)) {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
}

export function createTaskRecorder() {
  const calls: string[][] = []
  const installCalls: string[][] = []
  const invocations: { args: string[], cwd: string }[] = []
  const spawn = vi.fn((command: string, args: string[], options: SpawnSyncOptions) => {
    if (command !== 'pnpm') {
      throw new Error(`Unexpected command: ${command}`)
    }
    invocations.push({ args, cwd: String(options.cwd) })
    if (args[0] === 'install') {
      installCalls.push(args)
    }
    else {
      calls.push(args)
    }
    return { status: 0 } as SpawnSyncReturns<Buffer>
  }) as unknown as typeof spawnSync
  return { calls, installCalls, invocations, spawn }
}

export function expectSnapshotCleanup(recorder: ReturnType<typeof createTaskRecorder>, sourceRoot: string) {
  expect(recorder.invocations.length).toBeGreaterThan(0)
  for (const cwd of new Set(recorder.invocations.map(invocation => invocation.cwd))) {
    const relative = path.relative(sourceRoot, cwd)
    expect(relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))).toBe(false)
    expect(fs.existsSync(cwd)).toBe(false)
  }
}

export function pushInput(head: string, base = zeroSha) {
  return `refs/heads/main ${head} refs/heads/main ${base}`
}

export function expectedTasks(workspaces: string[]) {
  return [
    ...workspaces.map(dir => ['--dir', dir, 'build']),
    ['lint'],
    ['typecheck'],
    ...workspaces.map(dir => ['--dir', dir, 'tsd']),
    ...workspaces.map(dir => ['--dir', dir, 'test']),
  ]
}
