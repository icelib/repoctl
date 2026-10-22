import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createPackageFromTarballData } from '@arethetypeswrong/core'
import { createSnapshotPlan, releaseSnapshot } from '@icebreakers/monorepo'
import { expect, it } from 'vitest'
import { prepareNightlySnapshot } from '../../../../src/commands/release/snapshot'
import { fixture, snapshot } from './fixture'

it('keeps cold Turbo dependencies and private consumers intact through build and pack hooks', async () => {
  const h = await fixture()
  const root = JSON.parse(await readFile(path.join(h.cwd, 'package.json'), 'utf8'))
  await h.write('package.json', JSON.stringify({ ...root, scripts: { build: 'node build.cjs' } }))
  await h.write('pnpm-workspace.yaml', 'packages:\n  - packages/*\nlinkWorkspacePackages: false\nversioning:\n  changelog:\n    storage: repository\n')
  await h.write('turbo.json', JSON.stringify({ tasks: { build: { dependsOn: ['^build'], outputs: ['dist/**'], cache: false } } }))
  await h.write('build.cjs', 'const child=require("node:child_process").spawnSync(process.execPath,[process.env.SNAPSHOT_TURBO_BIN,"run","build","--concurrency=3"],{stdio:"inherit"});process.exit(child.status??1)')
  await h.write('hook.cjs', 'const fs=require("node:fs");for(const name of ["a","b","private"])fs.rmSync("packages/"+name+"/dist",{recursive:true,force:true});const child=require("node:child_process").spawnSync(process.execPath,["build.cjs"],{stdio:"inherit"});process.exit(child.status??1)')
  for (const name of ['a', 'b', 'private']) {
    const privatePackage = name === 'private'
    const manifest = privatePackage
      ? { name: 'snapshot-private', version: '1.0.0', private: true, dependencies: { 'build-b': 'workspace:snapshot-b@*' } }
      : JSON.parse(await readFile(path.join(h.cwd, 'packages', name, 'package.json'), 'utf8'))
    manifest.scripts = { build: 'node build.cjs', ...(!privatePackage ? { prepack: 'cd ../.. && node hook.cjs' } : {}) }
    await h.write(`packages/${name}/package.json`, JSON.stringify(manifest))
    const prerequisite = name === 'b' ? 'a' : privatePackage ? 'b' : undefined
    await h.write(`packages/${name}/build.cjs`, `const fs=require('node:fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
${privatePackage ? '' : 'if(!pkg.version.includes(\'-snapshot.\')) throw new Error(\'Build must see preview version\');'}
${prerequisite ? `if(!fs.existsSync('../${prerequisite}/dist/index.js')) throw new Error('Missing dependency build: ${prerequisite}');` : 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,300);'}
for(const value of Object.values(pkg.dependencies||{})) if(!value.startsWith('workspace:')) throw new Error('Workspace graph was rewritten before pack');
fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.js',${JSON.stringify(name === 'b' ? 'export {value} from "snapshot-a"' : 'export const value=42')});`)
  }
  h.run('pnpm', ['install', '--lockfile-only', '--ignore-scripts'])
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'cold topology'])
  const options = {
    ...h.options,
    identity: { kind: 'nightly' as const, commit: h.run('git', ['rev-parse', 'HEAD']), buildId: 'cold-turbo' },
    env: { ...h.options.env, SNAPSHOT_TURBO_BIN: createRequire(import.meta.url).resolve('turbo/bin/turbo'), TURBO_TELEMETRY_DISABLED: '1', TURBO_DAEMON: 'false' },
  }
  const before = await snapshot(h.cwd)
  const report = await releaseSnapshot(options)
  expect(report.status, report.error).toBe('prepared')
  expect(report.packages.map(pkg => pkg.name)).toEqual(['snapshot-a', 'snapshot-b'])
  const b = report.packages.find(pkg => pkg.name === 'snapshot-b')!
  const packed = createPackageFromTarballData(Uint8Array.from(await readFile(b.tarball!)))
  expect(JSON.parse(packed.readFile('/node_modules/snapshot-b/package.json')).dependencies['snapshot-a']).toBe(report.packages[0]!.version)
  expect(await snapshot(h.cwd)).toEqual(before)
}, 180_000)

it('prepares pkg.pr.new tarballs with catalog aliases and peers using explicit local consumer locators', async () => {
  const h = await fixture()
  const b = JSON.parse(await readFile(path.join(h.cwd, 'packages/b/package.json'), 'utf8'))
  await h.write('pnpm-workspace.yaml', 'packages:\n  - packages/*\ncatalog:\n  alias-a: workspace:snapshot-a@*\nversioning:\n  changelog:\n    storage: repository\n')
  await h.write('packages/b/package.json', JSON.stringify({ ...b, optionalDependencies: { 'alias-a': 'catalog:' }, peerDependencies: { 'snapshot-a': 'workspace:^' }, peerDependenciesMeta: { 'snapshot-a': { optional: true } } }))
  h.run('pnpm', ['install', '--lockfile-only', '--ignore-scripts'])
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'catalog aliases'])
  const options = { ...h.options, identity: { kind: 'nightly' as const, commit: h.run('git', ['rev-parse', 'HEAD']), buildId: 'pkg-pr-new-fixed' } }
  const report = await createSnapshotPlan(options)
  const before = await snapshot(h.cwd)
  await prepareNightlySnapshot(report, options, { provider: 'pkg-pr-new', repository: 'acme/repo' })
  expect(report.status).toBe('prepared')
  expect(report.checks?.every(check => check.status === 'passed')).toBe(true)
  const pkg = report.packages.find(item => item.name === 'snapshot-b')!
  const packed = createPackageFromTarballData(Uint8Array.from(await readFile(pkg.tarball!)))
  const manifest = JSON.parse(packed.readFile('/node_modules/snapshot-b/package.json'))
  expect(manifest.dependencies['snapshot-a']).toBe(`https://pkg.pr.new/acme/repo/snapshot-a@${options.identity.commit}`)
  expect(manifest.optionalDependencies['alias-a']).toBe(manifest.dependencies['snapshot-a'])
  expect(manifest.peerDependencies['snapshot-a']).toBe(report.packages[0]!.version)
  expect(await snapshot(h.cwd)).toEqual(before)
  expect(h.uploads).toEqual([])
}, 120_000)
