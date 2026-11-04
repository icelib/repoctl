import type { BootstrapOptions, BootstrapSource } from '@icebreakers/monorepo'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import crossSpawn from 'cross-spawn'
import { afterEach } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function installedPnpmLauncher(root: string, packageManager: string) {
  let cli = process.env['npm_execpath']
  if (!cli || !/^pnpm(?:[.-]|$)/u.test(path.basename(cli))) {
    const resolved = crossSpawn.sync('pnpm', ['exec', 'node', '--print', 'process.env.npm_execpath'], {
      cwd: path.resolve(import.meta.dirname, '../../../../../..'),
      env: process.env,
      encoding: 'utf8',
      timeout: 30_000,
    })
    if (resolved.error || resolved.status !== 0) {
      throw new Error(`Cannot resolve the test runner's installed pnpm: ${resolved.error?.message ?? resolved.stderr}`)
    }
    cli = resolved.stdout.trim()
  }
  cli = await realpath(cli)
  let metadata: { name?: string, version?: string } | undefined
  const cliDirectory = path.dirname(cli)
  for (const directory of [cliDirectory, path.dirname(cliDirectory)]) {
    try {
      const candidate = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')) as { name?: string, version?: string }
      if (candidate.name === 'pnpm') {
        metadata = candidate
        break
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  if (!metadata || `pnpm@${metadata.version}` !== packageManager.split('+')[0]) {
    throw new Error('Cold Corepack fixture requires the same installed pnpm as the workspace pin.')
  }
  const command = /\.[cm]?js$/u.test(cli) ? process.execPath : cli
  const prefix = command === process.execPath ? [cli] : []
  const bin = path.join(root, 'bin')
  const log = path.join(root, 'pnpm-invocations.jsonl')
  await mkdir(bin)
  const launcher = [
    '#!/usr/bin/env node',
    'const fs = require("node:fs");',
    'const { spawnSync } = require("node:child_process");',
    `fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), network: process.env.COREPACK_ENABLE_NETWORK, home: process.env.HOME }) + "\\n");`,
    `const result = spawnSync(${JSON.stringify(command)}, [...${JSON.stringify(prefix)}, ...process.argv.slice(2)], { env: process.env, stdio: "inherit" });`,
    'if (result.error) throw result.error;',
    'process.exit(result.status ?? 1);',
    '',
  ].join('\n')
  await writeFile(path.join(bin, 'pnpm'), launcher, { mode: 0o755 })
  await writeFile(path.join(bin, 'pnpm.cjs'), launcher)
  await writeFile(path.join(bin, 'pnpm.cmd'), `@"${process.execPath}" "${path.join(bin, 'pnpm.cjs')}" %*\r\n`)
  return { bin, log }
}

export async function prepareFixture(options: { coldCorepack?: boolean } = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'repo-bootstrap-')))
  roots.push(root)
  const cwd = path.join(root, 'workspace')
  await mkdir(cwd)
  const env: NodeJS.ProcessEnv = { ...process.env, CI: 'true' }
  for (const key of Object.keys(env)) {
    if (key.startsWith('GITHUB_') || key.startsWith('ACTIONS_') || ['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'REPOCTL_BOOTSTRAP_RUNNING'].includes(key)) {
      delete env[key]
    }
  }
  const rootManifest = JSON.parse(await readFile(new URL('../../../../../../package.json', import.meta.url), 'utf8')) as { packageManager: string }
  let launcherLog: string | undefined
  if (options.coldCorepack) {
    const launcher = await installedPnpmLauncher(root, rootManifest.packageManager)
    launcherLog = launcher.log
    const home = path.join(root, 'home')
    await mkdir(home)
    env['HOME'] = home
    env['USERPROFILE'] = home
    env['XDG_CACHE_HOME'] = path.join(home, '.cache')
    env['COREPACK_HOME'] = path.join(home, 'corepack')
    env['COREPACK_ENABLE_NETWORK'] = '0'
    env['COREPACK_ENABLE_AUTO_PIN'] = '0'
    env['PATH'] = [launcher.bin, env['PATH']].filter(Boolean).join(path.delimiter)
  }
  async function write(file: string, value: string) {
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true })
    await writeFile(path.join(cwd, file), value)
  }
  function run(command: string, args: string[]) {
    const result = crossSpawn.sync(command, args, { cwd, env, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout)
    }
    return result.stdout.trim()
  }
  await write('package.json', JSON.stringify({ name: 'bootstrap-root', private: true, packageManager: rootManifest.packageManager }))
  await write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
  await write('.gitignore', 'node_modules/\npackages/*/dist/\npackages/*/checks.log\n')
  await write('packages/a/package.json', JSON.stringify({
    name: 'bootstrap-a',
    version: '0.0.0',
    type: 'module',
    exports: './dist/index.js',
    files: ['dist'],
    scripts: { 'build': 'node build.cjs', 'lint': 'node check.cjs lint', 'typecheck': 'node check.cjs typecheck', 'test': 'node check.cjs test', 'test:types': 'node check.cjs test:types' },
    devDependencies: { 'bootstrap-build': 'workspace:*' },
  }))
  await write('packages/a/build.cjs', 'const fs=require("fs");fs.mkdirSync("dist",{recursive:true});fs.writeFileSync("dist/index.js","export const value = 42\\n");')
  await write('packages/a/check.cjs', 'require("fs").appendFileSync("checks.log", process.argv[2]+"\\n")')
  await write('packages/build/package.json', JSON.stringify({ name: 'bootstrap-build', version: '1.0.0', private: true, scripts: { build: 'node build.cjs' } }))
  await write('packages/build/build.cjs', 'require("fs").mkdirSync("dist",{recursive:true})')
  await write('packages/unrelated/package.json', JSON.stringify({ name: 'bootstrap-unrelated', version: '1.0.0', scripts: { build: 'node -e "process.exit(42)"' } }))
  run('pnpm', ['install', '--lockfile-only', '--ignore-scripts'])
  run('git', ['init', '--initial-branch=main', '-q'])
  run('git', ['config', 'maintenance.auto', 'false'])
  run('git', ['config', 'gc.auto', '0'])
  run('git', ['config', 'user.name', 'Fixture'])
  run('git', ['config', 'user.email', 'fixture@example.invalid'])
  run('git', ['config', 'core.hooksPath', path.join(root, 'no-hooks')])
  function commit() {
    run('git', ['add', '.'])
    run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'])
  }
  commit()
  function source(): BootstrapSource {
    return { repository: 'acme/repo', repositoryId: 12, commit: run('git', ['rev-parse', 'HEAD']), branch: 'main', runId: 123, runAttempt: 1, workflowRef: 'acme/repo/.github/workflows/release.yml@refs/heads/main' }
  }
  const bootstrapOptions: BootstrapOptions = { cwd, packageName: 'bootstrap-a', version: '0.1.0-alpha.0', source: source(), env, outputDirectory: path.join(root, 'output') }
  async function pnpmInvocations() {
    if (!launcherLog) {
      throw new Error('pnpm invocation evidence requires the cold Corepack fixture.')
    }
    return (await readFile(launcherLog, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as { cwd: string, args: string[], network?: string, home?: string })
  }
  return { cwd, root, env, options: bootstrapOptions, write, run, commit, source, pnpmInvocations }
}
