import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the shipped build and packing pipeline.
import { checkPackages } from '../../../dist/index.mjs'
import { addPackage, fixture } from './fixtures'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})
async function workspace() {
  const cwd = await fixture()
  roots.push(cwd)
  return cwd
}

it.each([
  ['app [one]', 'app o'],
  ['app {a,b}', 'app a'],
  ['app !()+@', 'app-other'],
  ...process.platform === 'win32' ? [] : [['app...', 'app']],
])('builds the literal directory %s without selecting a similar package', async (directory, decoy) => {
  const cwd = await workspace()
  const selected = await addPackage(cwd, directory, { name: 'fixture-literal', exports: './dist/index.mjs' }, { 'dist/index.mjs': 'export const value = 1' })
  const other = await addPackage(cwd, decoy, { name: 'fixture-decoy' }, {})
  const report = await checkPackages({ cwd, filters: ['fixture-literal'] })
  expect(report.status, JSON.stringify(report)).toBe('passed')
  expect(await readFile(path.join(selected, 'built-marker'), 'utf8')).toBe('built')
  await expect(access(path.join(other, 'built-marker'))).rejects.toThrow()
  expect(report.build?.args).toContain('--fail-if-no-match')
}, 60_000)

it('does not pack stale artifacts when a build in a bracketed directory fails', async () => {
  const cwd = await workspace()
  const directory = await addPackage(cwd, 'failing app [one]', {
    name: 'fixture-failure',
    exports: './dist/index.mjs',
    scripts: { build: 'node build.cjs', prepack: 'node prepack.cjs' },
  }, {})
  await mkdir(path.join(directory, 'dist'))
  await writeFile(path.join(directory, 'dist/index.mjs'), 'export const stale = true')
  await writeFile(path.join(directory, 'build.cjs'), 'process.exit(19)')
  await writeFile(path.join(directory, 'prepack.cjs'), 'require("node:fs").writeFileSync("PACK_RAN", "bad")')
  const report = await checkPackages({ cwd, filters: ['fixture-failure'] })
  expect(report.status, JSON.stringify(report)).toBe('failed')
  expect(report.packages[0]).toMatchObject({ status: 'skipped', reason: 'build_failed', commands: [] })
  expect(report.temporaryDirectory).toBeUndefined()
  await expect(access(path.join(directory, 'PACK_RAN'))).rejects.toThrow()
}, 60_000)

it.each(['workspace:*', 'workspace:../build-tool', 'file:../build-tool', 'link:../build-tool'])('delegates private development build prerequisites (%s) and their ordering to pnpm', async (spec) => {
  const cwd = await workspace()
  const prerequisite = await addPackage(cwd, 'build-tool', { name: 'fixture-build-tool', private: true }, {})
  const selected = await addPackage(cwd, 'library', {
    name: 'fixture-library',
    exports: './dist/index.mjs',
    devDependencies: { 'fixture-build-tool': spec },
  }, { 'dist/index.mjs': 'export const value = 1' })
  const buildFile = path.join(selected, 'build.cjs')
  await writeFile(buildFile, `require('node:fs').accessSync('../build-tool/built-marker');\n${await readFile(buildFile, 'utf8')}`)
  const report = await checkPackages({ cwd, filters: ['fixture-library'] })
  expect(report.status, JSON.stringify(report)).toBe('passed')
  expect(await readFile(path.join(prerequisite, 'built-marker'), 'utf8')).toBe('built')
  expect(report.packages.map(pkg => pkg.name)).toEqual(['fixture-library'])
  await writeFile(path.join(prerequisite, 'build.cjs'), 'process.exit(23)')
  const failed = await checkPackages({ cwd, filters: ['fixture-library'] })
  expect(failed.status).toBe('failed')
  expect(failed.temporaryDirectory).toBeUndefined()
}, 60_000)
