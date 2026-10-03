import type { SnapshotOptions } from '@icebreakers/monorepo'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createPackageFromTarballData } from '@arethetypeswrong/core'
import crossSpawn from 'cross-spawn'
import { afterEach } from 'vitest'
import { snapshot } from '../plan/fixture'
import { startSnapshotRegistry } from './registry'

export { snapshot }
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

export async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'repo-snapshot-')))
  roots.push(root)
  const cwd = path.join(root, 'workspace')
  const store = path.join(root, 'registry')
  await mkdir(cwd)
  await mkdir(store)
  const registry = await startSnapshotRegistry(store)
  const rootManifest = JSON.parse(await readFile(new URL('../../../../../../package.json', import.meta.url), 'utf8'))
  const env = { ...process.env, npm_config_registry: registry, CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'acme/repo', GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: path.join(root, 'event.json'), REPOCTL_SNAPSHOT_PUBLISH: '1' }
  async function write(file: string, value: string) {
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true })
    await writeFile(path.join(cwd, file), value)
  }
  await write('package.json', JSON.stringify({ name: 'fixture', private: true, packageManager: rootManifest.packageManager, scripts: { build: 'node build.cjs' } }))
  await write('pnpm-workspace.yaml', 'packages:\n  - packages/*\nversioning:\n  changelog:\n    storage: repository\n')
  await write('.gitignore', 'node_modules/\npackages/*/dist/\n')
  await write('.npmrc', `registry=${registry}\nfetch-retries=0\n`)
  await write('build.cjs', 'const fs=require("fs"); for(const name of ["a","b"]) {fs.mkdirSync("packages/"+name+"/dist",{recursive:true});fs.copyFileSync("packages/"+name+"/index.js","packages/"+name+"/dist/index.js")}')
  for (const name of ['a', 'b']) {
    await write(`packages/${name}/package.json`, JSON.stringify({ name: `snapshot-${name}`, version: '1.0.0', type: 'module', exports: './dist/index.js', files: ['dist'], ...(name === 'b' ? { dependencies: { 'snapshot-a': 'workspace:^' } } : {}) }))
    await write(`packages/${name}/index.js`, name === 'a' ? 'export const value = 42' : 'export { value } from "snapshot-a"')
  }
  await write('.changeset/snapshot.md', '---\nsnapshot-a: patch\n---\nImprove the fixture.\n')
  function run(command: string, args: string[], directory = cwd) {
    const result = crossSpawn.sync(command, args, { cwd: directory, env, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout)
    }
    return result.stdout.trim()
  }
  run('pnpm', ['install', '--lockfile-only', '--ignore-scripts'])
  run('git', ['init', '-q'])
  run('git', ['config', 'user.name', 'Fixture'])
  run('git', ['config', 'user.email', 'fixture@example.invalid'])
  run('git', ['config', 'core.hooksPath', path.join(root, 'no-hooks')])
  run('git', ['add', '.'])
  run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'])
  const commit = run('git', ['rev-parse', 'HEAD'])
  const event = { repository: { full_name: 'acme/repo' }, number: 12, pull_request: { head: { sha: commit, repo: { fork: false, full_name: 'acme/repo' } }, base: { repo: { full_name: 'acme/repo' } } } }
  await writeFile(env.GITHUB_EVENT_PATH, JSON.stringify(event))
  const uploads: string[][] = []
  const spawn: NonNullable<SnapshotOptions['spawn']> = ((command, args, settings) => {
    if (command === 'pnpm' && args?.[0] === 'publish') {
      if (crossSpawn.sync('git', ['rev-parse', '--git-dir'], settings as Parameters<typeof crossSpawn.sync>[2]).status === 0) {
        throw new Error('Publication escaped its isolated Git boundary')
      }
      const parameters = args as string[]
      uploads.push(parameters)
      const bytes = readFileSync(parameters[1]!)
      const pkg = createPackageFromTarballData(Uint8Array.from(bytes))
      const manifest = JSON.parse(pkg.readFile(`/node_modules/${pkg.packageName}/package.json`))
      const tarball = `${manifest.name}-${manifest.version}.tgz`
      writeFileSync(path.join(store, tarball), bytes)
      const metadata = { ...manifest, dist: { tarball: `${registry}tarballs/${tarball}`, integrity: `sha512-${(createHash('sha512').update(bytes).digest('base64'))}` } }
      const filename = path.join(store, `${manifest.name}.json`)
      let versions: Record<string, unknown> = {}
      try {
        versions = JSON.parse(readFileSync(filename, 'utf8'))
      }
      catch { /* First upload. */ }
      versions[manifest.version] = metadata
      writeFileSync(filename, JSON.stringify(versions))
      return { status: 0, signal: null, stdout: '', stderr: '', pid: 1, output: [null, '', ''] }
    }
    return crossSpawn.sync(command, args ?? [], settings as Parameters<typeof crossSpawn.sync>[2])
  }) as NonNullable<SnapshotOptions['spawn']>
  const options: SnapshotOptions = { cwd, env: { ...env, GITHUB_SHA: commit }, identity: { kind: 'pr', pullRequest: 12, commit, buildId: 'run-1-attempt-1' }, outputDirectory: path.join(root, 'output'), registry, spawn, sleep: async () => {} }
  return { cwd, root, store, env, event, options, uploads, write, run }
}
