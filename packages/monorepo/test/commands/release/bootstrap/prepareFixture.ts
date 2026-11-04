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

export async function prepareFixture() {
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
  const options: BootstrapOptions = { cwd, packageName: 'bootstrap-a', version: '0.1.0-alpha.0', source: source(), env, outputDirectory: path.join(root, 'output') }
  return { cwd, root, env, options, write, run, commit, source }
}
