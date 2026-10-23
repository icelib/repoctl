import { mkdir, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { minVersion, satisfies } from 'semver'
import { afterEach, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise shipped consumers with real peer installation.
import { checkPackages } from '../../../dist/index.mjs'
import { addPackage, fixture } from './fixtures'

const directories: string[] = []
afterEach(async () => Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))))

it('reserves tool aliases used only by required runtime peers before installing verification tooling', async () => {
  const cwd = await fixture()
  directories.push(cwd)
  const require = createRequire(import.meta.url)
  const compilerDirectory = path.dirname(require.resolve('typescript/package.json'))
  const compiler = JSON.parse(await readFile(path.join(compilerDirectory, 'package.json'), 'utf8'))
  const nodeTypes = JSON.parse(await readFile(require.resolve('@types/node/package.json'), 'utf8'))
  expect(compiler.version).toMatch(/^6\./)
  await mkdir(path.join(cwd, 'node_modules'))
  await symlink(compilerDirectory, path.join(cwd, 'node_modules/typescript'), 'junction')
  await addPackage(cwd, 'fixture-required-tool-aliases', {
    exports: { '.': { types: './dist/index.d.mts', import: './dist/index.mjs' } },
    peerDependencies: {
      'repoctl-consumer-typescript': 'npm:semver@^7.8.5',
      'repoctl-consumer-node-types': 'npm:semver@^7.8.5',
    },
  }, {
    'dist/index.mjs': `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
for (const alias of ['repoctl-consumer-typescript', 'repoctl-consumer-node-types']) {
  if (require(alias).valid('1.2.3') !== '1.2.3') throw new Error('Required runtime peer was replaced by verification tooling');
}
export const bytes = new Uint8Array();
export const environment = process.env;`,
    'dist/index.d.mts': 'export declare const bytes: Uint8Array<ArrayBuffer>; export declare const environment: NodeJS.ProcessEnv',
  })
  const report = await checkPackages({ cwd, keepTemp: true })
  directories.push(report.temporaryDirectory!)
  expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
  const checked = report.packages[0]!
  const consumer = checked.commands.find(command => command.args.includes('install'))!.cwd
  const manifest = JSON.parse(await readFile(path.join(consumer, 'package.json'), 'utf8'))
  expect(Object.keys(manifest.dependencies)).toEqual(['fixture-required-tool-aliases'])
  expect(manifest.devDependencies).toEqual({
    'repoctl-consumer-typescript-1': `npm:typescript@${compiler.version}`,
    'repoctl-consumer-node-types-1': `npm:@types/node@${nodeTypes.version}`,
  })
  const installed = createRequire(path.join(consumer, 'package.json'))
  const subject = createRequire(await realpath(path.join(consumer, 'node_modules/fixture-required-tool-aliases/package.json')))
  for (const alias of ['repoctl-consumer-typescript', 'repoctl-consumer-node-types']) {
    expect(subject(`${alias}/package.json`).name).toBe('semver')
  }
  const typecheck = checked.commands.find(command => command.args.includes('--noEmit'))!
  expect(typecheck.args[0]).toBe(await realpath(installed.resolve('repoctl-consumer-typescript-1/bin/tsc')))
  const typeRoots = typecheck.args[typecheck.args.indexOf('--typeRoots') + 1]!
  expect(await realpath(path.join(typeRoots, 'node'))).toBe(await realpath(path.dirname(installed.resolve('repoctl-consumer-node-types-1/package.json'))))
  expect(typecheck.exitCode, typecheck.output).toBe(0)
  const runtime = checked.commands.filter(command => command.args.includes('--eval'))
  expect(runtime).toHaveLength(1)
  expect(runtime[0]!.exitCode, runtime[0]!.output).toBe(0)
}, 120_000)

it('resolves a complex optional npm alias intersection to a published version before consumer installation', async () => {
  const cwd = await fixture()
  directories.push(cwd)
  // The lower bound 7.8.5-0 is not published. Keep the upper bound exact so a
  // later semver release cannot change the expected registry selection.
  await addPackage(cwd, 'fixture-peer-range-leaf', {
    exports: './dist/index.mjs',
    peerDependencies: { provider: 'npm:semver@<=7.8.5' },
  }, {
    'dist/index.mjs': `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const provider = require('provider');
const manifest = require('provider/package.json');
if (manifest.name !== 'semver' || manifest.version !== '7.8.5' || provider.valid('1.2.3') !== '1.2.3') throw new Error('Required alias provider was not installed');
export const version = manifest.version;`,
  })
  await addPackage(cwd, 'fixture-peer-range-root', {
    exports: './dist/index.mjs',
    dependencies: { 'fixture-peer-range-leaf': 'workspace:*' },
    peerDependencies: { provider: 'npm:semver@>=7.8.5-0' },
    peerDependenciesMeta: { provider: { optional: true } },
  }, {
    'dist/index.mjs': `import { createRequire } from 'node:module';
import { version } from 'fixture-peer-range-leaf';
const require = createRequire(import.meta.url);
if (require('provider/package.json').version !== version || require('provider').valid('1.2.3') !== '1.2.3') throw new Error('Runtime closure did not share its compatible alias provider');
export { version };`,
  })
  const report = await checkPackages({ cwd, filters: ['fixture-peer-range-root'], keepTemp: true })
  directories.push(report.temporaryDirectory!)
  expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
  expect(report.packages).toHaveLength(2)
  const checked = report.packages.find(pkg => pkg.name === 'fixture-peer-range-root')!
  const query = checked.commands.find(command => command.args.includes('view'))!
  expect(query).toBeDefined()
  expect(query.args).toEqual(expect.arrayContaining(['view', 'version', '--json']))
  const range = query.args.find(argument => argument.startsWith('semver@'))!.slice('semver@'.length)
  expect(minVersion(range)?.version).toBe('7.8.5-0')
  expect(satisfies('7.8.5', range)).toBe(true)
  expect(satisfies('7.8.4', range)).toBe(false)
  expect(satisfies('7.8.6', range)).toBe(false)
  expect(query.exitCode, query.output).toBe(0)
  const install = checked.commands.find(command => command.args.includes('install'))!
  expect(checked.commands.indexOf(query)).toBeLessThan(checked.commands.indexOf(install))
  const manifest = JSON.parse(await readFile(path.join(install.cwd, 'package.json'), 'utf8'))
  expect(manifest.dependencies.provider).toBe('npm:semver@7.8.5')
  expect(manifest.devDependencies).toBeUndefined()
  const installed = createRequire(path.join(install.cwd, 'package.json'))
  expect(installed('provider/package.json').version).toBe('7.8.5')
  const runtime = checked.commands.filter(command => command.args.includes('--eval'))
  expect(runtime).toHaveLength(1)
  expect(runtime[0]!.exitCode, runtime[0]!.output).toBe(0)
}, 120_000)
