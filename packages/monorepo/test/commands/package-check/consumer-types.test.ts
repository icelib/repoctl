import { mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
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

it('installs an explicit fallback compiler and Node types without borrowing ancestor tooling or changing the published package', async () => {
  const parent = await workspace()
  const cwd = path.join(parent, 'workspace')
  await mkdir(cwd)
  await writeFile(path.join(cwd, 'package.json'), await readFile(path.join(parent, 'package.json')))
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  await mkdir(path.join(parent, 'node_modules/typescript'), { recursive: true })
  await writeFile(path.join(parent, 'node_modules/typescript/package.json'), JSON.stringify({ name: 'typescript', version: '99.0.0' }))
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
  const fallback = JSON.parse(await readFile(createRequire(import.meta.resolve('@arethetypeswrong/core/package.json')).resolve('typescript/package.json'), 'utf8'))
  expect(manifest.devDependencies).toEqual({ 'repoctl-consumer-node-types': `npm:@types/node@${toolchain.version}`, 'repoctl-consumer-typescript': `npm:typescript@${fallback.version}` })
  const installedTypes = await realpath(path.join(consumer, 'node_modules/repoctl-consumer-node-types'))
  expect(path.relative(await realpath(consumer), installedTypes)).not.toMatch(/^\.\./)
  const installedPackage = JSON.parse(await readFile(path.join(consumer, 'node_modules/fixture-node-types/package.json'), 'utf8'))
  expect(installedPackage.dependencies).toBeUndefined()
  expect(installedPackage.devDependencies).toBeUndefined()
  const typecheck = report.packages[0]!.commands.find(command => command.args.includes('--noEmit'))!
  expect(typecheck.args[0]).toBe(await realpath(path.join(consumer, 'node_modules/repoctl-consumer-typescript/bin/tsc')))
  expect(path.relative(await realpath(consumer), typecheck.args[0]!)).not.toMatch(/^\.\./)
  expect(typecheck.args.slice(typecheck.args.indexOf('--types'), typecheck.args.indexOf('--types') + 2)).toEqual(['--types', 'node'])
  const typeRoots = typecheck.args[typecheck.args.indexOf('--typeRoots') + 1]!
  expect(path.relative(await realpath(consumer), typeRoots)).not.toMatch(/^\.\./)
  expect(await realpath(path.join(typeRoots, 'node'))).toBe(installedTypes)
  expect(typecheck.args.slice(typecheck.args.indexOf('--skipLibCheck'), typecheck.args.indexOf('--skipLibCheck') + 2)).toEqual(['--skipLibCheck', 'false'])
}, 120_000)

it('uses the installed workspace TypeScript version for generic typed arrays and installs that exact compiler in the consumer', async () => {
  const cwd = await workspace()
  const rootManifest = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'))
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ ...rootManifest, devDependencies: { typescript: 'catalog:' } }))
  await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\ncatalog:\n  typescript: ^6.0.0\n')
  const source = path.dirname(createRequire(import.meta.url).resolve('typescript/package.json'))
  const { version } = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'))
  expect(version).toMatch(/^6\./)
  await mkdir(path.join(cwd, 'node_modules'))
  await symlink(source, path.join(cwd, 'node_modules/typescript'), 'junction')
  await addPackage(cwd, 'fixture-modern-declarations', { exports: { '.': { types: './dist/index.d.mts', import: './dist/index.mjs' } } }, {
    'dist/index.mjs': 'export const bytes = new Uint8Array()',
    'dist/index.d.mts': 'export declare const bytes: Uint8Array<ArrayBuffer>',
  })
  const report = await checkPackages({ cwd, keepTemp: true })
  directories.push(report.temporaryDirectory!)
  expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
  const consumer = path.join(report.temporaryDirectory!, 'consumers', '0')
  const manifest = JSON.parse(await readFile(path.join(consumer, 'package.json'), 'utf8'))
  expect(manifest.devDependencies['repoctl-consumer-typescript']).toBe(`npm:typescript@${version}`)
  const compiler = report.packages[0]!.commands.find(command => command.args.includes('--noEmit'))!
  expect(compiler.args[0]).toBe(await realpath(path.join(consumer, 'node_modules/repoctl-consumer-typescript/bin/tsc')))
  expect(path.relative(await realpath(consumer), compiler.args[0]!)).not.toMatch(/^\.\./)
  expect(compiler.args[0]).not.toBe(await realpath(path.join(source, 'bin/tsc')))
  expect(compiler.exitCode, compiler.output).toBe(0)
}, 120_000)

it('preserves older runtime TypeScript and Node peers and occupied tool aliases while checking declarations with the source compiler', async () => {
  const cwd = await workspace()
  const require = createRequire(import.meta.url)
  const source = path.dirname(require.resolve('typescript/package.json'))
  const compiler = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'))
  const nodeTypes = JSON.parse(await readFile(require.resolve('@types/node/package.json'), 'utf8'))
  expect(compiler.version).toMatch(/^6\./)
  expect(nodeTypes.version).toMatch(/^22\./)
  await mkdir(path.join(cwd, 'node_modules'))
  await symlink(source, path.join(cwd, 'node_modules/typescript'), 'junction')
  await addPackage(cwd, 'fixture-runtime-tooling', {
    exports: { '.': { types: './dist/index.d.mts', import: './dist/index.mjs' } },
    peerDependencies: {
      'typescript': '5.6.3',
      '@types/node': '18.19.0',
      'repoctl-consumer-typescript': 'npm:semver@^7.8.5',
      'repoctl-consumer-node-types': 'npm:semver@^7.8.5',
    },
    peerDependenciesMeta: {
      'typescript': { optional: true },
      '@types/node': { optional: true },
      'repoctl-consumer-typescript': { optional: true },
      'repoctl-consumer-node-types': { optional: true },
    },
  }, {
    'dist/index.mjs': `import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
const require = createRequire(import.meta.url);
if (require('typescript').version !== '5.6.3') throw new Error('Runtime TypeScript peer was replaced');
if (require('@types/node/package.json').version !== '18.19.0') throw new Error('Runtime Node types peer was replaced');
for (const alias of ['repoctl-consumer-typescript', 'repoctl-consumer-node-types']) {
  if (require(alias).valid('1.2.3') !== '1.2.3') throw new Error('Runtime alias was replaced');
}
export const stream = Readable.from([]);
export const environment = process.env;
export const bytes = new Uint8Array();
export const builtin = process.getBuiltinModule;`,
    'dist/index.d.mts': 'import type { Readable } from "node:stream"; export declare const stream: Readable; export declare const environment: NodeJS.ProcessEnv; export declare const bytes: Uint8Array<ArrayBuffer>; export declare const builtin: typeof process.getBuiltinModule',
  })
  const report = await checkPackages({ cwd, keepTemp: true })
  directories.push(report.temporaryDirectory!)
  expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
  const consumer = path.join(report.temporaryDirectory!, 'consumers', '0')
  const installed = createRequire(path.join(consumer, 'package.json'))
  expect(installed('typescript/package.json').version).toBe('5.6.3')
  expect(installed('@types/node/package.json').version).toBe('18.19.0')
  for (const alias of ['repoctl-consumer-typescript', 'repoctl-consumer-node-types']) {
    expect(installed(`${alias}/package.json`).name).toBe('semver')
  }
  const manifest = JSON.parse(await readFile(path.join(consumer, 'package.json'), 'utf8'))
  expect(manifest.devDependencies).toEqual({
    'repoctl-consumer-typescript-1': `npm:typescript@${compiler.version}`,
    'repoctl-consumer-node-types-1': `npm:@types/node@${nodeTypes.version}`,
  })
  expect(installed('repoctl-consumer-typescript-1/package.json').version).toBe(compiler.version)
  expect(installed('repoctl-consumer-node-types-1/package.json').version).toBe(nodeTypes.version)
  const check = report.packages[0]!.commands.find(command => command.args.includes('--noEmit'))!
  expect(check.args[0]).toBe(await realpath(installed.resolve('repoctl-consumer-typescript-1/bin/tsc')))
  const typeRoots = check.args[check.args.indexOf('--typeRoots') + 1]!
  expect(await realpath(path.join(typeRoots, 'node'))).toBe(await realpath(path.dirname(installed.resolve('repoctl-consumer-node-types-1/package.json'))))
  expect(check.exitCode, check.output).toBe(0)
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
