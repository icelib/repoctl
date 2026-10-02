import { access, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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

describe('actual published tarball validation', () => {
  it('builds and consumes ESM and declared CJS tarballs, excluding source and private packages', async () => {
    const cwd = await workspace()
    await addPackage(cwd, 'fixture-esm', { exports: { '.': { types: './dist/index.d.mts', import: './dist/index.mjs' } } }, {
      'dist/index.mjs': 'export const value = 42',
      'dist/index.d.mts': 'export declare const value: number',
    })
    await addPackage(cwd, 'fixture-cjs', { type: 'commonjs', exports: { '.': { types: './dist/index.d.cts', require: './dist/index.cjs' } } }, {
      'dist/index.cjs': 'module.exports = 42',
      'dist/index.d.cts': 'declare const value: number; export = value',
    })
    const privateDir = await addPackage(cwd, 'fixture-private', { private: true }, {})
    const report = await checkPackages({ cwd, keepTemp: true })
    directories.push(report.temporaryDirectory!)
    expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
    expect(report.packages.find(pkg => pkg.name === 'fixture-private')).toMatchObject({ status: 'skipped', reason: 'private_package' })
    await expect(access(path.join(privateDir, 'built-marker'))).rejects.toThrow()
    for (const pkg of report.packages.filter(pkg => pkg.status === 'passed')) {
      expect(pkg.files).toContain('package.json')
      expect(pkg.files).not.toContain('build.cjs')
      expect(pkg.commands.some(command => command.args.includes('--eval'))).toBe(true)
      expect(pkg.commands.some(command => command.args.includes('--noEmit'))).toBe(true)
    }
  }, 120_000)

  it('builds runtime workspace dependencies and consumes their converted tarballs without source links', async () => {
    const cwd = await workspace()
    await addPackage(cwd, 'fixture-dependency', { exports: './dist/index.mjs' }, { 'dist/index.mjs': 'export const value = 42' })
    await addPackage(cwd, 'fixture-consumer', { exports: './dist/index.mjs', dependencies: { 'fixture-dependency': 'workspace:*' } }, {
      'dist/index.mjs': 'import { value } from "fixture-dependency"; if (value !== 42) throw new Error("wrong dependency"); export { value }',
    })
    const report = await checkPackages({ cwd, filters: ['fixture-consumer'], keepTemp: true })
    directories.push(report.temporaryDirectory!)
    expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
    expect(report.packages.map(pkg => [pkg.name, pkg.role])).toEqual([['fixture-consumer', 'selected'], ['fixture-dependency', 'dependency']])
    const consumer = path.join(report.temporaryDirectory!, 'consumers', '0', 'node_modules', 'fixture-consumer', 'package.json')
    expect(JSON.parse(await readFile(consumer, 'utf8')).dependencies).toEqual({ 'fixture-dependency': '1.0.0' })
  }, 120_000)

  it('reports missing published exports, types and bin with upstream diagnostic origins', async () => {
    const cwd = await workspace()
    await addPackage(cwd, 'fixture-broken', { exports: { types: './dist/missing.d.mts', import: './dist/missing.mjs' }, bin: './dist/missing.js' }, {
      'dist/other.d.mts': 'export declare const value: number',
    })
    const report = await checkPackages({ cwd })
    expect(report.status).toBe('failed')
    const diagnostics = report.packages[0]!.diagnostics
    expect(diagnostics).toContainEqual(expect.objectContaining({ source: 'publint', code: 'FILE_DOES_NOT_EXIST', severity: 'error' }))
    expect(diagnostics).toContainEqual(expect.objectContaining({ source: 'attw', code: 'NoResolution', severity: 'error' }))
    expect(diagnostics.some(item => item.file?.includes('bin'))).toBe(true)
    await expect(access(report.temporaryDirectory!)).rejects.toThrow()
  }, 60_000)

  it('stops before packing any package when build fails', async () => {
    const cwd = await workspace()
    const directory = await addPackage(cwd, 'fixture-build-fails', { exports: './dist/index.mjs' }, {})
    await writeFile(path.join(directory, 'build.cjs'), 'process.exit(23)')
    const report = await checkPackages({ cwd })
    expect(report.status).toBe('failed')
    expect(report.temporaryDirectory).toBeUndefined()
    expect(report.packages[0]).toMatchObject({ status: 'skipped', reason: 'build_failed', commands: [] })
  }, 60_000)
})
