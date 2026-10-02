import { execFileSync, spawnSync } from 'node:child_process'
import { access, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Verify the shipped API instead of source-only execution.
import { checkPackages } from '../../../dist/index.mjs'
import { addPackage, fixture } from './fixtures'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

async function workspace() {
  const cwd = await fixture()
  directories.push(cwd)
  return cwd
}

it('honors publishConfig entries and file lists, and expands wildcard exports from tarball files', async () => {
  const cwd = await workspace()
  await addPackage(cwd, 'fixture-publish-config', {
    main: './src/wrong.js',
    publishConfig: { main: './dist/index.cjs', exports: { './*': './dist/*.cjs' } },
  }, { 'dist/index.cjs': 'module.exports = 1', 'dist/extra.cjs': 'module.exports = 2', 'src/wrong.js': 'throw new Error("source leaked")' })
  const report = await checkPackages({ cwd })
  expect(report.status, JSON.stringify(report)).toBe('passed')
  expect(report.packages[0]!.files).not.toContain('src/wrong.js')
  expect(report.packages[0]!.commands.filter(command => command.args.includes('--eval'))).toHaveLength(2)
}, 60_000)

it('detects undeclared runtime dependencies from the installed tarball', async () => {
  const cwd = await workspace()
  await addPackage(cwd, 'fixture-missing-runtime', { exports: './dist/index.mjs' }, { 'dist/index.mjs': 'import "repoctl-fixture-dependency-that-does-not-exist"' })
  const report = await checkPackages({ cwd, keepTemp: true })
  directories.push(report.temporaryDirectory!)
  expect(report.status).toBe('failed')
  expect(report.packages[0]!.diagnostics).toContainEqual(expect.objectContaining({ source: 'node', code: 'RUNTIME_IMPORT', entry: '.', file: './dist/index.mjs' }))
  expect(report.packages[0]!.commands.find(command => command.args.includes('--eval'))?.exitCode).not.toBe(0)
}, 60_000)

it('does not replace a skipped private workspace dependency with a registry package', async () => {
  const cwd = await workspace()
  await addPackage(cwd, 'fixture-private-dependency', { private: true, exports: './dist/index.mjs' }, { 'dist/index.mjs': 'export const value = 1' })
  await addPackage(cwd, 'fixture-public-dependent', { exports: './dist/index.mjs', dependencies: { 'fixture-private-dependency': 'workspace:*' } }, { 'dist/index.mjs': 'import "fixture-private-dependency"' })
  const report = await checkPackages({ cwd, filters: ['fixture-public-dependent'] })
  const result = report.packages.find(pkg => pkg.name === 'fixture-public-dependent')!
  expect(report.status).toBe('failed')
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'WORKSPACE_DEPENDENCY_UNAVAILABLE' }))
  expect(result.commands.some(command => command.args.includes('install'))).toBe(false)
}, 60_000)

it('preserves source versions and release state, and emits language-independent JSON from the built CLI', async () => {
  const cwd = await workspace()
  const directory = await addPackage(cwd, 'fixture-cli', { private: true, exports: './dist/index.mjs' }, { 'dist/index.mjs': 'export const value = 1' })
  const manifest = await readFile(path.join(directory, 'package.json'), 'utf8')
  const cli = fileURLToPath(new URL('../../../dist/cli.mjs', import.meta.url))
  const outputs = ['en', 'zh-CN'].map(locale => JSON.parse(execFileSync(process.execPath, [cli, '--lang', locale, 'package', 'check', '--json'], { cwd, encoding: 'utf8', env: { ...process.env, CI: 'true' } })))
  expect(outputs[0]).toEqual(outputs[1])
  expect(outputs[0].packages[0]).toMatchObject({ status: 'skipped', reason: 'private_package' })
  const report = await checkPackages({ cwd, includePrivate: true })
  expect(report.status, JSON.stringify(report)).toBe('passed')
  expect(await readFile(path.join(directory, 'package.json'), 'utf8')).toBe(manifest)
  await expect(access(path.join(cwd, '.repo'))).rejects.toThrow()
  await expect(access(path.join(cwd, 'pnpm-publish-summary.json'))).rejects.toThrow()
}, 60_000)

it('rejects recursive package checks in build scripts before creating tarballs', async () => {
  const cwd = await workspace()
  const directory = await addPackage(cwd, 'fixture-recursion', {}, {})
  const entry = new URL('../../../dist/index.mjs', import.meta.url).href
  await writeFile(path.join(directory, 'build.cjs'), `import(${JSON.stringify(entry)}).then(api => api.checkPackages({cwd: process.cwd()}))`)
  const report = await checkPackages({ cwd })
  expect(report.status).toBe('failed')
  expect(report.build?.output).toContain('cannot run recursively')
  expect(report.temporaryDirectory).toBeUndefined()
}, 60_000)

it('typechecks type-only packages without executing them as JavaScript', async () => {
  const cwd = await workspace()
  await addPackage(cwd, 'fixture-type-only', { exports: { types: './dist/index.d.mts' } }, { 'dist/index.d.mts': 'export interface Value { count: number }' })
  const report = await checkPackages({ cwd })
  expect(report.status, JSON.stringify(report)).toBe('passed')
  expect(report.packages[0]!.commands.some(command => command.args.includes('--noEmit'))).toBe(true)
  expect(report.packages[0]!.commands.some(command => command.args.includes('--eval'))).toBe(false)
}, 60_000)

it('packs real source packages behind workspace, npm, and relative workspace aliases', async () => {
  const cwd = await workspace()
  await addPackage(cwd, 'fixture-real', { name: '@fixture/real', exports: './dist/index.mjs' }, { 'dist/index.mjs': 'export const value = 42' })
  await addPackage(cwd, 'fixture-alias', {
    exports: './dist/index.mjs',
    dependencies: { alias: 'workspace:@fixture/real@*', relative: 'workspace:../fixture-real', registryAlias: 'npm:@fixture/real@1.0.0' },
  }, { 'dist/index.mjs': 'import {value as a} from "alias"; import {value as b} from "relative"; import {value as c} from "registryAlias"; if(a+b+c!==126) throw new Error("wrong aliased tarball")' })
  const report = await checkPackages({ cwd, filters: ['fixture-alias'], keepTemp: true })
  directories.push(report.temporaryDirectory!)
  expect(report.status, JSON.stringify(report)).toBe('passed')
  expect(report.packages.find(pkg => pkg.name === '@fixture/real')?.role).toBe('dependency')
  const manifest = JSON.parse(await readFile(path.join(report.temporaryDirectory!, 'consumers', '0', 'node_modules', 'fixture-alias', 'package.json'), 'utf8'))
  expect(manifest.dependencies.alias).toBe('npm:@fixture/real@1.0.0')
  expect(manifest.dependencies.relative).toBe('npm:@fixture/real@1.0.0')
}, 60_000)

it.each(['file:', 'link:'])('discovers %s workspace references and rejects unconverted local protocols', async (protocol) => {
  const cwd = await workspace()
  await addPackage(cwd, 'fixture-local', { exports: './dist/index.mjs' }, { 'dist/index.mjs': 'export const value = 1' })
  await addPackage(cwd, 'fixture-file-dependent', { exports: './dist/index.mjs', dependencies: { alias: `${protocol}../fixture-local` } }, { 'dist/index.mjs': 'export const value = 1' })
  const report = await checkPackages({ cwd, filters: ['fixture-file-dependent'] })
  expect(report.status).toBe('failed')
  expect(report.packages.find(pkg => pkg.name === 'fixture-local')?.role).toBe('dependency')
  expect(report.packages[0]!.diagnostics).toContainEqual(expect.objectContaining({ code: 'UNCONVERTED_LOCAL_DEPENDENCY' }))
  expect(report.packages[0]!.commands.some(command => command.args.includes('install'))).toBe(false)
}, 60_000)

it('terminates a timed-out build before packing', async () => {
  const cwd = await workspace()
  const directory = await addPackage(cwd, 'fixture-timeout', {}, {})
  await writeFile(path.join(directory, 'build.cjs'), 'setInterval(() => {}, 1000)')
  const report = await checkPackages({ cwd, timeoutMs: 1500 })
  expect(report.status).toBe('failed')
  expect(report.build?.output).toContain('Command timed out')
  expect(report.temporaryDirectory).toBeUndefined()
}, 15_000)

it('returns nonzero with parseable JSON for a release gate failure in CI', async () => {
  const cwd = await workspace()
  await addPackage(cwd, 'fixture-gate', { exports: './dist/missing.mjs' }, {})
  const cli = fileURLToPath(new URL('../../../dist/cli.mjs', import.meta.url))
  const child = spawnSync(process.execPath, [cli, 'package', 'check', '--json'], { cwd, encoding: 'utf8', env: { ...process.env, CI: 'true' } })
  expect(child.status, child.stderr).toBe(1)
  expect(JSON.parse(child.stdout)).toMatchObject({ schemaVersion: 1, status: 'failed' })
}, 60_000)
