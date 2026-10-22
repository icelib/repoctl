import { readFile, realpath, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Verify isolated consumers of shipped tarballs.
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

it('installs a controlled Node type toolchain in the isolated consumer without changing the published package', async () => {
  const cwd = await workspace()
  await addPackage(cwd, 'fixture-node-types', { exports: { '.': { types: './dist/index.d.mts', import: './dist/index.mjs' } } }, {
    'dist/index.mjs': 'import { Readable } from "node:stream"; export const stream = Readable.from([]); export const environment = process.env',
    'dist/index.d.mts': 'import type { Readable } from "node:stream"; export declare const stream: Readable; export declare const environment: NodeJS.ProcessEnv',
  })
  const report = await checkPackages({ cwd, keepTemp: true })
  directories.push(report.temporaryDirectory!)
  expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
  const consumer = path.join(report.temporaryDirectory!, 'consumers', '0')
  const manifest = JSON.parse(await readFile(path.join(consumer, 'package.json'), 'utf8'))
  const toolchain = JSON.parse(await readFile(createRequire(import.meta.url).resolve('@types/node/package.json'), 'utf8'))
  expect(manifest.devDependencies).toEqual({ '@types/node': toolchain.version })
  const installedTypes = await realpath(path.join(consumer, 'node_modules', '@types/node'))
  expect(path.relative(await realpath(consumer), installedTypes)).not.toMatch(/^\.\./)
  const installedPackage = JSON.parse(await readFile(path.join(consumer, 'node_modules/fixture-node-types/package.json'), 'utf8'))
  expect(installedPackage.dependencies).toBeUndefined()
  expect(installedPackage.devDependencies).toBeUndefined()
  const typecheck = report.packages[0]!.commands.find(command => command.args.includes('--noEmit'))!
  expect(typecheck.args.slice(typecheck.args.indexOf('--types'), typecheck.args.indexOf('--types') + 2)).toEqual(['--types', 'node'])
  expect(typecheck.args.slice(typecheck.args.indexOf('--skipLibCheck'), typecheck.args.indexOf('--skipLibCheck') + 2)).toEqual(['--skipLibCheck', 'false'])
}, 120_000)

it('still rejects invalid package declarations and transitive declarations with Node ambient types installed', async () => {
  const cwd = await workspace()
  await addPackage(cwd, 'fixture-invalid-declarations', { exports: { '.': { types: './dist/index.d.mts', import: './dist/index.mjs' } } }, {
    'dist/index.mjs': 'export const value = 1',
    'dist/index.d.mts': 'export interface Invalid { [key: string]: string; enabled: boolean } export declare const value: number',
  })
  await addPackage(cwd, 'fixture-declaration-consumer', {
    exports: { '.': { types: './dist/index.d.mts', import: './dist/index.mjs' } },
    dependencies: { 'fixture-invalid-declarations': 'workspace:*' },
  }, {
    'dist/index.mjs': 'export { value } from "fixture-invalid-declarations"',
    'dist/index.d.mts': 'export { value } from "fixture-invalid-declarations"; export type { Invalid } from "fixture-invalid-declarations"',
  })
  const report = await checkPackages({ cwd, filters: ['fixture-declaration-consumer'] })
  expect(report.status).toBe('failed')
  expect(report.packages).toHaveLength(2)
  for (const result of report.packages) {
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'TYPESCRIPT_CONSUMER',
      severity: 'error',
      message: expect.stringContaining('TS2411'),
    }))
  }
}, 120_000)

it('does not install TypeScript ambient tooling for JavaScript-only packages', async () => {
  const cwd = await workspace()
  await addPackage(cwd, 'fixture-javascript', { exports: './dist/index.mjs' }, { 'dist/index.mjs': 'export const value = 1' })
  const report = await checkPackages({ cwd, keepTemp: true })
  directories.push(report.temporaryDirectory!)
  expect(report.status, JSON.stringify(report)).toBe('passed')
  const manifest = JSON.parse(await readFile(path.join(report.temporaryDirectory!, 'consumers', '0/package.json'), 'utf8'))
  expect(manifest.devDependencies).toBeUndefined()
  expect(report.packages[0]!.commands.some(command => command.args.includes('--noEmit'))).toBe(false)
}, 120_000)
