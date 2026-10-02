import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { checkPeerDependencies } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { stringify } from 'yaml'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(peers: Record<string, string>, dev: Record<string, string> = {}, extra: Record<string, unknown> = {}, workspace: Record<string, unknown> = {}) {
  const cwd = await realpath(await mkdtemp(path.join(tmpdir(), 'repoctl peer checks ')))
  roots.push(cwd)
  await writeFile(path.join(cwd, 'package.json'), '{"name":"peer-root","private":true}')
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), stringify({ packages: ['libraries/*'], ...workspace }))
  await mkdir(path.join(cwd, 'libraries/subject'), { recursive: true })
  await writeFile(path.join(cwd, 'libraries/subject/package.json'), JSON.stringify({ name: '@fixture/subject', private: true, version: '1.0.0', peerDependencies: peers, devDependencies: dev, ...extra }))
  return cwd
}

it('compares full declared ranges and prereleases without pretending one minimum covers a support range', async () => {
  const cwd = await fixture({ inside: '^1', outside: '^1', partial: '^1', composite: '^1 || ^2', prerelease: '^2.0.0-beta.1', excludedPre: '^2' }, { inside: '^1.2', outside: '^2', partial: '^1 || ^2', composite: '^2.3', prerelease: '2.0.0-beta.2', excludedPre: '2.0.0-beta.2' })
  const report = await checkPeerDependencies(cwd)
  const checks = Object.fromEntries(report.checks['map'](check => [check.peer, check]))
  expect(checks['inside']).toMatchObject({ status: 'pass', evidence: 'declared_range', testVersion: null })
  expect(checks['outside']).toMatchObject({ status: 'fail', code: 'incompatible_test_range' })
  expect(checks['partial']).toMatchObject({ status: 'unknown', code: 'partial_range_overlap' })
  expect(checks['composite']?.status).toBe('pass')
  expect(checks['prerelease']?.status).toBe('pass')
  expect(checks['excludedPre']?.status).toBe('fail')
})

it('permits absent optional peers while checking present optional test declarations', async () => {
  const cwd = await fixture({ absent: '^1', present: '^1', required: '^1' }, { present: '^2' }, { peerDependenciesMeta: { absent: { optional: true }, present: { optional: true } } })
  const report = await checkPeerDependencies(cwd)
  expect(report.checks).toMatchObject([
    { peer: 'absent', status: 'skipped', code: 'optional_peer_missing' },
    { peer: 'present', status: 'fail' },
    { peer: 'required', status: 'fail', code: 'missing_test_dependency' },
  ])
})

it('resolves default/named catalogs and package aliases and keeps unknown sources visible', async () => {
  const cwd = await fixture({ cataloged: '^1', named: 'catalog:peers', unknown: '^1', unknownPeer: 'latest', alias: 'npm:real@^1', wrong: 'npm:first@^1' }, { cataloged: 'catalog:', named: 'catalog:dev', unknown: 'github:org/repo', unknownPeer: '^1', alias: 'npm:real@1.2.0', wrong: 'npm:second@1.0.0' }, {}, { catalog: { cataloged: '1.2.0' }, catalogs: { peers: { named: '^2' }, dev: { named: '2.1.0' } } })
  const checks = Object.fromEntries((await checkPeerDependencies(cwd)).checks['map'](check => [check.peer, check]))
  for (const name of ['cataloged', 'named', 'alias']) {
    expect(checks[name]?.status).toBe('pass')
  }
  expect(checks['unknown']?.code).toBe('unresolved_test_dependency')
  expect(checks['unknownPeer']?.code).toBe('unresolved_peer')
  expect(checks['wrong']?.code).toBe('different_package_source')
})

it('uses real workspace versions for aliases and reports ranges excluding a workspace target', async () => {
  const cwd = await fixture({ lib: 'workspace:@fixture/lib@^', wrong: 'workspace:@fixture/lib@^2' }, { lib: 'workspace:../lib', wrong: 'workspace:@fixture/lib@*' })
  await mkdir(path.join(cwd, 'libraries/lib'))
  await writeFile(path.join(cwd, 'libraries/lib/package.json'), '{"name":"@fixture/lib","version":"1.3.0"}')
  const report = await checkPeerDependencies(cwd)
  expect(report.checks).toMatchObject([
    { peer: 'lib', status: 'pass', evidence: 'workspace_version', testVersion: '1.3.0' },
    { peer: 'wrong', status: 'fail', code: 'workspace_range_mismatch' },
  ])
})

it('recognizes catalog:default and refuses ambiguous default catalog declarations', async () => {
  const cwd = await fixture({ host: '^1' }, { host: 'catalog:default' }, {}, { catalogs: { default: { host: '1.2.0' } } })
  expect((await checkPeerDependencies(cwd)).checks[0]).toMatchObject({ status: 'pass', evidence: 'declared_version', testVersion: '1.2.0' })
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), stringify({ packages: ['libraries/*'], catalog: { host: '1.2.0' }, catalogs: { default: { host: '1.3.0' } } }))
  expect((await checkPeerDependencies(cwd)).checks[0]).toMatchObject({ status: 'unknown', code: 'unresolved_test_dependency' })
})

it('uses matching lock evidence rather than guessing from an overlapping declaration', async () => {
  const cwd = await fixture({ inside: '^1', outside: '^1' }, { inside: '^1 || ^2', outside: '^1 || ^2' }, {}, { autoInstallPeers: false, strictPeerDependencies: true })
  const lock = { lockfileVersion: '9.0', importers: { 'libraries/subject': { devDependencies: { inside: { specifier: '^1 || ^2', version: '1.4.0(other@2.0.0)' }, outside: { specifier: '^1 || ^2', version: '2.1.0' } } } } }
  await writeFile(path.join(cwd, 'pnpm-lock.yaml'), `---\nlockfileVersion: '9.0'\nimporters: { .: { packageManagerDependencies: {} } }\n---\n${stringify(lock)}`)
  const report = await checkPeerDependencies(cwd)
  expect(report.pnpmPolicy).toEqual({ autoInstallPeers: false, strictPeerDependencies: true })
  expect(report.checks).toMatchObject([
    { peer: 'inside', status: 'pass', evidence: 'lockfile_version', testVersion: '1.4.0' },
    { peer: 'outside', status: 'fail', code: 'incompatible_test_version', testVersion: '2.1.0' },
  ])
})

it('does not trust stale or unsupported locks, while preserving definite declaration contradictions', async () => {
  const cwd = await fixture({ stale: '^1', contradictory: '^1' }, { stale: '^1', contradictory: '^2' })
  await writeFile(path.join(cwd, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { 'libraries/subject': { devDependencies: { stale: { specifier: '^2', version: '2.0.0' } } } } }))
  expect((await checkPeerDependencies(cwd)).checks).toMatchObject([
    { peer: 'contradictory', status: 'fail', code: 'incompatible_test_range' },
    { peer: 'stale', status: 'unknown', code: 'stale_lockfile' },
  ])
  await writeFile(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 99\nimporters: {}\n')
  expect((await checkPeerDependencies(cwd)).checks[1]?.code).toBe('unsupported_lockfile')
})

it('runs the built CLI without writes and preserves stable JSON in both locales', async () => {
  const cwd = await fixture({ unknown: '^1' }, { unknown: 'file:../unknown' })
  const inputs = ['package.json', 'pnpm-workspace.yaml', 'libraries/subject/package.json']
  const before = await Promise.all(inputs.map(file => readFile(path.join(cwd, file), 'utf8')))
  const cli = fileURLToPath(new URL('../../../dist/cli.mjs', import.meta.url))
  const run = (locale: string, strict = false) => spawnSync(process.execPath, [cli, '--lang', locale, 'deps', 'peers', '--json', ...(strict ? ['--strict'] : [])], { cwd: path.join(cwd, 'libraries/subject'), encoding: 'utf8', env: { ...process.env, CI: 'true' } })
  const en = run('en')
  const zh = run('zh-CN')
  expect(en.status, en.stderr).toBe(0)
  expect(JSON.parse(en.stdout)).toEqual(JSON.parse(zh.stdout))
  expect(JSON.parse(en.stdout).summary.unknown).toBe(1)
  expect(run('en', true).status).toBe(1)
  expect(await Promise.all(inputs.map(file => readFile(path.join(cwd, file), 'utf8')))).toEqual(before)
  await expect(readFile(path.join(cwd, 'pnpm-lock.yaml'))).rejects.toThrow()
})
