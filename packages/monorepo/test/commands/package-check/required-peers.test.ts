import type { PackedManifest } from '../../../src/commands/package-check/types'
import { expect, it } from 'vitest'
import { consumerOptionalPeers } from '../../../src/commands/package-check/consumer/optional-peers'
import { consumerRuntimeClosure } from '../../../src/commands/package-check/consumer/runtime-closure'

const host: PackedManifest = { name: 'fixture-required-host', version: '1.2.3' }
const bridge: PackedManifest = { name: 'fixture-required-bridge', version: '1.2.3', peerDependencies: { 'host-alias': 'npm:fixture-required-host@^1' } }
const adapter: PackedManifest = { name: 'fixture-required-adapter', version: '1.2.3', peerDependencies: { 'fixture-required-bridge': '^1' } }
const manifests = [host, bridge, adapter]

it.each([
  ['tarball', 'file:checked-host.tgz', 'file:checked-bridge.tgz'],
  ['nightly', 'npm:fixture-required-host@snapshot-nightly', 'npm:fixture-required-bridge@snapshot-nightly'],
  ['prepared snapshot', 'npm:fixture-required-host@1.2.3', 'npm:fixture-required-bridge@1.2.3'],
  ['pkg.pr.new', 'https://pkg.pr.new/acme/repo/fixture-required-host@commit', 'https://pkg.pr.new/acme/repo/fixture-required-bridge@commit'],
])('installs direct and transitive required peers from their checked %s locators', (_kind, hostLocator, bridgeLocator) => {
  const closure = consumerRuntimeClosure([adapter], manifests)
  expect(consumerOptionalPeers(closure, new Map([[host.name!, hostLocator], [bridge.name!, bridgeLocator]]))).toEqual({
    'fixture-required-bridge': bridgeLocator,
    'host-alias': hostLocator,
  })
})

it('uses checked workspace versions when no explicit locator map is supplied', () => {
  expect(consumerOptionalPeers(consumerRuntimeClosure([adapter], manifests))).toEqual({
    'fixture-required-bridge': '1.2.3',
    'host-alias': 'npm:fixture-required-host@1.2.3',
  })
})

it('does not inject unrelated workspace packages, external required peers or development dependencies', () => {
  const root: PackedManifest = { name: 'root', peerDependencies: { required: 'latest', optional: '^5' }, peerDependenciesMeta: { optional: { optional: true } }, devDependencies: { 'fixture-required-host': '^1' } }
  expect(consumerOptionalPeers(consumerRuntimeClosure([root], [root, ...manifests]))).toEqual({ optional: '^5' })
})

it('retains all required peer constraints and rejects incompatible candidate versions or missing locators', () => {
  const second: PackedManifest = { name: 'second', peerDependencies: { 'host-alias': 'npm:fixture-required-host@>=1.2 <2' } }
  const closure = () => consumerRuntimeClosure([bridge, second], [host, bridge, second])
  expect(consumerOptionalPeers(closure(), new Map([[host.name!, 'file:checked-host.tgz']]))).toEqual({ 'host-alias': 'file:checked-host.tgz' })
  expect(() => consumerOptionalPeers(closure(), new Map())).toThrow('no checked tarball')
  second.peerDependencies!['host-alias'] = 'npm:fixture-required-host@>=1.3 <2'
  expect(() => consumerOptionalPeers(closure())).toThrow('does not accept checked workspace package')
  second.peerDependencies!['host-alias'] = 'npm:fixture-required-host@^2'
  expect(() => consumerOptionalPeers(closure())).toThrow('incompatible declared ranges')
})

it('rejects conflicting names when a required alias resolves to a checked workspace package', () => {
  const conflicting: PackedManifest = { name: 'conflicting', peerDependencies: { 'host-alias': 'npm:external-host@^1' } }
  expect(() => consumerOptionalPeers(consumerRuntimeClosure([bridge, conflicting], [host, bridge, conflicting]))).toThrow('conflicting package names')
})

it.each(['latest', 'file:../host', 'workspace:^1', 'github:acme/host'])('rejects unsupported required workspace peer protocol %s', (range) => {
  const root: PackedManifest = { name: 'root', peerDependencies: { 'fixture-required-host': range } }
  expect(() => consumerOptionalPeers(consumerRuntimeClosure([root], [root, host]))).toThrow('registry version range')
})
