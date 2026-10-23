import type { PackedManifest } from '../../../src/commands/package-check/types'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the shipped package consumer.
import { checkPackages } from '../../../dist/index.mjs'
import { consumerAssetSource } from '../../../src/commands/package-check/consumer/runtime-assets'
import { consumerEntries } from '../../../src/commands/package-check/entries'
import { addPackage, fixture } from './fixtures'

const directories: string[] = []
afterEach(async () => Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))))
const manifest: PackedManifest = { name: 'fixture-worker', type: 'module', exports: { '.': './dist/index.mjs', './worker.js': './dist/worker.mjs' }, repoctl: { packageCheck: { runtimeAssets: ['./worker.js'] } } }
const files = ['dist/index.mjs', 'dist/worker.mjs']

it('requires each resource declaration to identify an existing exact JavaScript export', () => {
  const entries = consumerEntries(manifest, files)
  expect(entries.find(entry => entry.subpath === '.')).not.toHaveProperty('asset')
  expect(entries.find(entry => entry.subpath === './worker.js')).toMatchObject({ asset: true, runtime: true, format: 'esm' })
  for (const runtimeAssets of [['./missing'], ['./worker*'], ['../worker.js'], ['./..\\worker.js'], 'worker.js', [false]]) {
    expect(() => consumerEntries({ ...manifest, repoctl: { packageCheck: { runtimeAssets } } }, files)).toThrow(/runtimeAssets|Runtime asset/u)
  }
  expect(() => consumerEntries(manifest, ['dist/index.mjs'])).toThrow('packed JavaScript export')
  expect(() => consumerEntries({ ...manifest, exports: { './worker.js': './worker.txt' } }, ['worker.txt'])).toThrow('packed JavaScript export')
})

it('checks packed worker syntax without executing browser globals and still executes ordinary exports', async () => {
  const cwd = await fixture()
  directories.push(cwd)
  const directory = await addPackage(cwd, 'fixture-worker', manifest as Record<string, unknown>, {
    'dist/index.mjs': 'export const value = 1',
    'dist/worker.mjs': 'self.addEventListener("fetch", () => {});',
  })
  const report = await checkPackages({ cwd })
  expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
  expect(report.packages[0]!.commands.some(command => command.args.includes('--check'))).toBe(true)
  const source = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
  delete source.repoctl
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(source))
  const undeclared = await checkPackages({ cwd })
  expect(undeclared.status).toBe('failed')
  expect(undeclared.packages[0]!.diagnostics).toContainEqual(expect.objectContaining({ code: 'RUNTIME_IMPORT', entry: './worker.js', message: expect.stringContaining('self is not defined') }))
}, 120_000)

it('rejects invalid resource syntax instead of treating a successful resolution as a passing check', async () => {
  const cwd = await fixture()
  directories.push(cwd)
  await addPackage(cwd, 'fixture-worker', manifest as Record<string, unknown>, { 'dist/index.mjs': 'export const value = 1', 'dist/worker.mjs': 'function {' })
  const report = await checkPackages({ cwd })
  expect(report.status).toBe('failed')
  expect(report.packages[0]!.diagnostics).toContainEqual(expect.objectContaining({ code: 'RUNTIME_ASSET_SYNTAX', entry: './worker.js' }))
}, 120_000)

it('checks a typed main entry without inventing a type contract for a copied worker resource', async () => {
  const cwd = await fixture()
  directories.push(cwd)
  await addPackage(cwd, 'fixture-worker', {
    ...manifest,
    exports: { '.': { types: './dist/index.d.mts', import: './dist/index.mjs' }, './worker.js': './dist/worker.mjs' },
  }, {
    'dist/index.mjs': 'export const value = 1',
    'dist/index.d.mts': 'export declare const value: number',
    'dist/worker.mjs': 'self.addEventListener("fetch", () => {});',
  })
  const report = await checkPackages({ cwd })
  expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
  const checks = report.packages[0]!.commands.filter(command => command.args.includes('--noEmit'))
  expect(checks).toHaveLength(1)
  expect(checks[0]!.exitCode).toBe(0)
}, 120_000)

it.each(['explicit', 'adjacent'] as const)('still rejects invalid %s declarations attached to a runtime asset', async (kind) => {
  const cwd = await fixture()
  directories.push(cwd)
  await addPackage(cwd, 'fixture-worker', {
    ...manifest,
    exports: {
      '.': { types: './dist/index.d.mts', import: './dist/index.mjs' },
      './worker.js': kind === 'explicit' ? { types: './dist/worker.d.mts', import: './dist/worker.mjs' } : './dist/worker.mjs',
    },
  }, {
    'dist/index.mjs': 'export const value = 1',
    'dist/index.d.mts': 'export declare const value: number',
    'dist/worker.mjs': 'self.addEventListener("fetch", () => {});',
    'dist/worker.d.mts': 'export interface Invalid { [key: string]: string; enabled: boolean }',
  })
  const report = await checkPackages({ cwd })
  expect(report.status).toBe('failed')
  expect(report.packages[0]!.diagnostics).toContainEqual(expect.objectContaining({ code: 'TYPESCRIPT_CONSUMER', entry: './worker.js', message: expect.stringContaining('TS2411') }))
}, 120_000)

it.each(['esm', 'cjs'] as const)('requires %s resource resolution to match its checked file inside the package', async (format) => {
  const cwd = await fixture()
  directories.push(cwd)
  const installed = path.join(cwd, 'node_modules', 'fixture-worker')
  await mkdir(path.join(installed, 'dist'), { recursive: true })
  await writeFile(path.join(installed, 'package.json'), JSON.stringify(manifest))
  await writeFile(path.join(installed, 'dist/index.mjs'), '')
  const resource = path.join(installed, 'dist/worker.mjs')
  await writeFile(resource, 'self.addEventListener("fetch", () => {});')
  const entry = { subpath: './worker.js', target: './dist/worker.mjs', format, runtime: true, asset: true }
  const run = (target = entry) => spawnSync(process.execPath, ['--input-type', format === 'esm' ? 'module' : 'commonjs', '--eval', consumerAssetSource(target, 'fixture-worker/worker.js', installed)], { cwd, encoding: 'utf8' })
  expect(run().status).toBe(0)
  expect(run({ ...entry, target: './dist/index.mjs' }).status).not.toBe(0)
  await rm(resource)
  expect(run().status).not.toBe(0)
  const outside = path.join(cwd, 'outside.mjs')
  await writeFile(outside, 'export const escaped = true')
  await symlink(outside, resource)
  expect(run().status).not.toBe(0)
})
