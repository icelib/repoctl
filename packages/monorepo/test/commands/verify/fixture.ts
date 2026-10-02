import type { PrePushVerifyOptions } from '@icebreakers/monorepo'
import type { spawnSync } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { verifyPrePush } from '@icebreakers/monorepo'

export const zeroSha = '0'.repeat(40)
export const rootChecks = [['lint'], ['typecheck']]
export const rootFullChecks = [...rootChecks, ['build'], ['test'], ['tsd']]
const tasks = ['build', 'test', 'tsd', 'lint', 'typecheck']

export async function createFixture(patterns = ['packages/*', 'apps/*', 'domains/**', '!packages/ignored']) {
  const cwd = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl-pre-push-')))
  async function write(file: string, content: string) {
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true })
    await writeFile(path.join(cwd, file), content)
  }
  function git(...args: string[]) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  }
  async function addPackage(dir: string, options: { private?: boolean, scripts?: string[] } = {}) {
    const runner = path.relative(path.join(cwd, dir), path.join(cwd, 'record-task.cjs')).split(path.sep).join('/')
    await write(`${dir}/package.json`, JSON.stringify({
      name: `@fixture/${dir.replaceAll('/', '-')}`,
      version: '1.0.0',
      private: options.private ?? false,
      scripts: Object.fromEntries((options.scripts ?? tasks.slice(0, 3)).map(task => [task, `node ${JSON.stringify(runner)} ${task}`])),
    }))
    await write(`${dir}/src/index.ts`, `export const value = '${dir}'\n`)
  }
  function commit() {
    git('add', '.')
    git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture')
    return git('rev-parse', 'HEAD')
  }
  function stdin(base: string, head = git('rev-parse', 'HEAD')) {
    return `refs/heads/main ${head} refs/heads/main ${base}`
  }
  async function run(base: string, options: Partial<PrePushVerifyOptions> = {}) {
    const calls: string[][] = []
    const directories: string[] = []
    const spawn = ((command: string, args: string[], spawnOptions: { cwd: string }) => {
      if (command !== 'pnpm') {
        throw new Error(`Unexpected command: ${command}`)
      }
      calls.push(args)
      directories.push(spawnOptions.cwd)
      return { status: 0 }
    }) as typeof spawnSync
    await verifyPrePush({ cwd, stdinText: stdin(base), spawn, ...options })
    return { calls, directories }
  }

  await write('package.json', JSON.stringify({
    name: 'fixture',
    private: true,
    scripts: Object.fromEntries(tasks.map(task => [task, `node record-task.cjs ${task}`])),
  }))
  await write('pnpm-workspace.yaml', JSON.stringify({ packages: patterns }))
  await write('.gitignore', 'node_modules\nchecks.log\n')
  // Explicit arguments avoid Windows case-insensitive lifecycle environment collisions.
  await write('record-task.cjs', String.raw`require('node:fs').appendFileSync(process.env.REPOCTL_VERIFY_FIXTURE_LOG, JSON.stringify({ cwd: process.cwd(), task: process.argv[2] }) + '\n')`)
  git('init', '-q')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Fixture')
  git('config', 'core.hooksPath', path.join(cwd, 'disabled-hooks'))
  return { cwd, write, git, addPackage, commit, stdin, run }
}

export function packageChecks(dir: string, tasks = ['build', 'test', 'tsd']) {
  return tasks.map(task => ['--dir', dir, task])
}
