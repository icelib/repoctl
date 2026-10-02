import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const stages = ['build', 'lint', 'typecheck', 'tsd', 'test']
const cliEntry = fileURLToPath(new URL('../../../../repoctl/bin/repo.js', import.meta.url))

export function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export async function write(cwd: string, filename: string, contents = 'changed') {
  await mkdir(path.dirname(path.join(cwd, filename)), { recursive: true })
  await writeFile(path.join(cwd, filename), contents)
}

export async function addPackage(cwd: string, directory: string, name: string, dependencies: Record<string, string> = {}, tasks = stages) {
  const runner = path.posix.relative(directory, 'record.cjs')
  const scripts = Object.fromEntries(tasks.map(task => [task, `node ${runner} ${task}`]))
  await write(cwd, `${directory}/package.json`, JSON.stringify({ name, version: '1.0.0', private: true, dependencies, scripts }))
  await write(cwd, `${directory}/src/index.ts`, 'export const value = 1\n')
}

export function commit(cwd: string) {
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-m', 'fixture')
  return git(cwd, 'rev-parse', 'HEAD')
}

export async function fixture(options: { rootScripts?: boolean, globalInput?: string } = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'repo-affected-')))
  const cwd = path.join(root, 'checkout')
  await mkdir(cwd)
  const { packageManager } = JSON.parse(await readFile(new URL('../../../../../package.json', import.meta.url), 'utf8'))
  await write(cwd, 'package.json', JSON.stringify({ name: 'affected-root', private: true, packageManager, scripts: options.rootScripts ? Object.fromEntries(stages.map(task => [task, `node record.cjs ${task}`])) : {} }))
  await write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n  - apps/*\n')
  await write(cwd, '.gitignore', '.built\nreports/\n')
  await write(cwd, 'record.cjs', String.raw`const fs = require('node:fs'); const path = require('node:path');
const task = process.argv[2]; const name = JSON.parse(fs.readFileSync('package.json')).name;
if (task === 'build') fs.writeFileSync('.built', 'yes');
if (task === 'test' && !fs.existsSync('.built')) process.exit(73);
if (process.env.REPOCTL_AFFECTED_LOG) fs.appendFileSync(process.env.REPOCTL_AFFECTED_LOG, JSON.stringify([name, task]) + '\n');
`)
  await addPackage(cwd, 'packages/base', '@fixture/base')
  await addPackage(cwd, 'packages/shared', '@fixture/shared', { '@fixture/base': 'workspace:*' })
  await addPackage(cwd, 'apps/web', '@fixture/web', { '@fixture/shared': 'workspace:*' })
  await addPackage(cwd, 'apps/isolated', '@fixture/isolated', {}, ['build', 'test'])
  if (options.globalInput) {
    await write(cwd, 'turbo.json', JSON.stringify({ globalDependencies: [options.globalInput], tasks: {} }))
    await write(cwd, options.globalInput, 'baseline')
  }
  git(cwd, 'init', '-b', 'main')
  git(cwd, 'config', 'user.name', 'Fixture')
  git(cwd, 'config', 'user.email', 'fixture@example.test')
  git(cwd, 'config', 'core.hooksPath', path.join(root, 'disabled-hooks'))
  return { root, cwd, base: commit(cwd), log: path.join(root, 'execution.jsonl') }
}

export function cli(cwd: string, args: string[], log?: string) {
  return execFileSync(process.execPath, [cliEntry, 'check', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(log ? { REPOCTL_AFFECTED_LOG: log } : {}) },
  })
}

export async function readExecutions(log: string): Promise<Array<[string, string]>> {
  return (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
}
