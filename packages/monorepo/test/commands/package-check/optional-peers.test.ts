import type { PackedManifest } from '../../../src/commands/package-check/types'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { satisfies } from 'semver'
import { afterEach, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the shipped package consumer.
import { checkPackages } from '../../../dist/index.mjs'
import { consumerOptionalPeers } from '../../../src/commands/package-check/consumer/optional-peers'
import { consumerRuntimeClosure } from '../../../src/commands/package-check/consumer/runtime-closure'
import { addPackage, fixture } from './fixtures'

const directories: string[] = []
afterEach(async () => Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))))

function optional(name: string, peer: string, range: string): PackedManifest {
  return { name, version: '1.0.0', peerDependencies: { [peer]: range }, peerDependenciesMeta: { [peer]: { optional: true } } }
}

it('uses only the runtime closure, including local optional peers, and handles cycles', () => {
  const root = { name: 'root', dependencies: { core: '1.0.0' }, devDependencies: { unrelated: '1.0.0' } }
  const core = { ...optional('core', 'provider', '^6 || ^8'), dependencies: { root: '1.0.0' }, peerDependencies: { provider: '^6 || ^8', playground: '1.0.0' }, peerDependenciesMeta: { provider: { optional: true }, playground: { optional: true } } }
  const playground = optional('playground', 'second-provider', '^2')
  const unrelated = optional('unrelated', 'rogue', '*')
  const closure = consumerRuntimeClosure([root], [root, core, playground, unrelated])
  const result = consumerOptionalPeers(closure)
  expect(Object.keys(result)).toEqual(['playground', 'provider', 'second-provider'])
  expect(result['playground']).toBe('1.0.0')
  expect(satisfies('8.3.5', result['provider']!)).toBe(true)
  expect(closure.references.map(({ reference }) => reference.alias)).not.toContain('unrelated')
  expect(closure.references.map(({ reference }) => reference.alias)).not.toContain('rogue')
})

it('intersects optional and required peer constraints across all roots without losing OR alternatives', () => {
  const first = optional('first', 'provider', '^6 || ^8')
  const second = optional('second', 'provider', '>=8.2 <9')
  const required = { name: 'required', peerDependencies: { provider: '<8.4' } }
  const result = consumerOptionalPeers(consumerRuntimeClosure([first, second, required], [first, second, required]))
  expect(satisfies('8.3.5', result['provider']!)).toBe(true)
  for (const version of ['6.1.0', '8.1.0', '8.4.0']) {
    expect(satisfies(version, result['provider']!)).toBe(false)
  }
  required.peerDependencies.provider = '^5'
  expect(() => consumerOptionalPeers(consumerRuntimeClosure([first, required], [first, required]))).toThrow('incompatible declared ranges')
})

it('preserves registry aliases and rejects conflicting identities or unsupported optional peer protocols', () => {
  const first = optional('first', 'provider', 'npm:semver@^7')
  expect(consumerOptionalPeers(consumerRuntimeClosure([first], [first]))['provider']).toBe('npm:semver@^7')
  const second = optional('second', 'provider', 'npm:other@^7')
  expect(() => consumerOptionalPeers(consumerRuntimeClosure([first, second], [first, second]))).toThrow('conflicting package names')
  for (const range of ['file:../provider', 'workspace:^7', 'latest', 'github:acme/provider']) {
    const manifest = optional('subject', 'provider', range)
    expect(() => consumerOptionalPeers(consumerRuntimeClosure([manifest], [manifest]))).toThrow('registry version range')
  }
  const required = { name: 'required', peerDependencies: { provider: 'latest' } }
  expect(consumerOptionalPeers(consumerRuntimeClosure([required], [required]))).toEqual({})
})

it('leaves required-only alias contexts to the package manager and validates conflicts only when injecting an optional peer', () => {
  const first: PackedManifest = { name: 'first', peerDependencies: { provider: 'npm:semver@^7' } }
  const second: PackedManifest = { name: 'second', peerDependencies: { provider: 'npm:other@^7' } }
  expect(consumerOptionalPeers(consumerRuntimeClosure([first, second], [first, second]))).toEqual({})
  second.peerDependenciesMeta = { provider: { optional: true } }
  expect(() => consumerOptionalPeers(consumerRuntimeClosure([first, second], [first, second]))).toThrow('conflicting package names')
})

it('injects checked local optional peers by alias while retaining every required peer range', () => {
  const root = optional('root', 'provider', 'npm:integration@^1')
  const integration: PackedManifest = { name: 'integration', version: '1.2.3' }
  const required = { name: 'required', peerDependencies: { provider: 'npm:integration@>=1.2' } }
  const manifests = [root, integration, required]
  expect(consumerOptionalPeers(consumerRuntimeClosure([root, required], manifests))).toEqual({ provider: 'npm:integration@1.2.3' })
  expect(consumerOptionalPeers(consumerRuntimeClosure([root, required], manifests), new Map([['integration', 'file:/checked/integration.tgz']]))).toEqual({ provider: 'file:/checked/integration.tgz' })
  required.peerDependencies.provider = 'npm:integration@<1.2'
  expect(() => consumerOptionalPeers(consumerRuntimeClosure([root, required], manifests))).toThrow('does not accept checked workspace package')
  required.peerDependencies.provider = 'npm:integration@^2'
  expect(() => consumerOptionalPeers(consumerRuntimeClosure([root, required], manifests))).toThrow('incompatible declared ranges')
})

it('executes optional integrations from packed runtime dependencies without copying development dependencies', async () => {
  const cwd = await fixture()
  directories.push(cwd)
  await addPackage(cwd, 'fixture-optional-core', {
    exports: { '.': './dist/index.mjs', './adapter': './dist/adapter.mjs' },
    peerDependencies: { semver: '^7.8.5' },
    peerDependenciesMeta: { semver: { optional: true } },
    devDependencies: { 'not-a-real-consumer-development-dependency': '*' },
  }, {
    'dist/index.mjs': 'export const value = 1',
    'dist/adapter.mjs': 'import semver from "semver"; if (semver.valid("1.2.3") !== "1.2.3") throw new Error("adapter not exercised"); export const integrated = true',
  })
  await addPackage(cwd, 'fixture-optional-root', { exports: './dist/index.mjs', dependencies: { 'fixture-optional-core': 'workspace:*' } }, {
    'dist/index.mjs': 'export { integrated } from "fixture-optional-core/adapter"',
  })
  await addPackage(cwd, 'fixture-unrelated', { ...optional('fixture-unrelated', 'not-a-real-consumer-provider', '*'), exports: './dist/index.mjs' }, { 'dist/index.mjs': 'export const unused = true' })
  const report = await checkPackages({ cwd, filters: ['fixture-optional-root'], keepTemp: true })
  directories.push(report.temporaryDirectory!)
  expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
  expect(report.packages).toHaveLength(2)
  for (const index of [0, 1]) {
    const consumer = JSON.parse(await readFile(path.join(report.temporaryDirectory!, 'consumers', String(index), 'package.json'), 'utf8'))
    expect(satisfies('7.8.5', consumer.dependencies.semver)).toBe(true)
    expect(consumer.dependencies).not.toHaveProperty('not-a-real-consumer-provider')
    expect(consumer.dependencies).not.toHaveProperty('not-a-real-consumer-development-dependency')
    expect(consumer.devDependencies).toBeUndefined()
  }
}, 120_000)

it('installs a local optional integration alias from its checked tarball and executes its own optional provider', async () => {
  const cwd = await fixture()
  directories.push(cwd)
  await addPackage(cwd, 'fixture-local-integration', {
    exports: './dist/index.mjs',
    peerDependencies: { semver: '^7.8.5' },
    peerDependenciesMeta: { semver: { optional: true } },
  }, {
    'dist/index.mjs': 'import semver from "semver"; export const value = semver.valid("1.2.3")',
  })
  await addPackage(cwd, 'fixture-local-core', {
    exports: './dist/index.mjs',
    peerDependencies: { integration: 'workspace:fixture-local-integration@*' },
    peerDependenciesMeta: { integration: { optional: true } },
  }, {
    'dist/index.mjs': 'import { value } from "integration"; if (value !== "1.2.3") throw new Error("local optional integration not exercised"); export { value }',
  })
  const report = await checkPackages({ cwd, filters: ['fixture-local-core'], keepTemp: true })
  directories.push(report.temporaryDirectory!)
  expect(report.status, JSON.stringify(report, null, 2)).toBe('passed')
  expect(report.packages).toHaveLength(2)
  const coreIndex = report.packages.findIndex(pkg => pkg.name === 'fixture-local-core')
  const consumer = path.join(report.temporaryDirectory!, 'consumers', String(coreIndex))
  const manifest = JSON.parse(await readFile(path.join(consumer, 'package.json'), 'utf8'))
  const integration = report.packages.find(pkg => pkg.name === 'fixture-local-integration')!
  expect(manifest.dependencies.integration).toBe(`file:${integration.tarball}`)
  expect(satisfies('7.8.5', manifest.dependencies.semver)).toBe(true)
  expect(JSON.parse(await readFile(path.join(consumer, 'node_modules/integration/package.json'), 'utf8')).name).toBe('fixture-local-integration')
}, 120_000)
