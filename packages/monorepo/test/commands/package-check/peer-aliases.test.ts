import { expect, it, vi } from 'vitest'
import { consumerOptionalPeers } from '../../../src/commands/package-check/consumer/optional-peers'
import { resolveConsumerPeerAliases } from '../../../src/commands/package-check/consumer/peer-aliases'
import { consumerRuntimeClosure } from '../../../src/commands/package-check/consumer/runtime-closure'

it('retains an original constraint when it already expresses the complete peer intersection', async () => {
  const optional = { name: 'optional', peerDependencies: { provider: 'npm:semver@^7.8.5' }, peerDependenciesMeta: { provider: { optional: true } } }
  const required = { name: 'required', peerDependencies: { provider: 'npm:semver@>=7' } }
  const dependencies = consumerOptionalPeers(consumerRuntimeClosure([optional, required], [optional, required]))
  expect(dependencies).toEqual({ provider: 'npm:semver@^7.8.5' })
  const query = vi.fn()
  await expect(resolveConsumerPeerAliases({ ...dependencies, union: 'npm:semver@^6 || ^7', exact: 'npm:semver@7.8.5', regular: '>=7.8.5 <8' }, query)).resolves.toEqual({
    ...dependencies,
    union: 'npm:semver@^6 || ^7',
    exact: 'npm:semver@7.8.5',
    regular: '>=7.8.5 <8',
  })
  expect(query).not.toHaveBeenCalled()
})

it('selects the highest published matching version rather than the lower bound or an out-of-range response', async () => {
  const query = vi.fn(async () => JSON.stringify(['7.8.6', '7.8.5', '8.0.0', '7.0.0']))
  await expect(resolveConsumerPeerAliases({ provider: 'npm:semver@>=7.8.5-0 <7.9' }, query)).resolves.toEqual({ provider: 'npm:semver@7.8.6' })
  expect(query).toHaveBeenCalledExactlyOnceWith('semver@>=7.8.5-0 <7.9')
})

it.each(['[]', '["6.0.0", "8.0.0"]'])('rejects registry responses without a matching published version: %s', async (response) => {
  await expect(resolveConsumerPeerAliases({ provider: 'npm:semver@>=7.8.5 <8' }, async () => response)).rejects.toThrow('no published version matching')
})

it.each(['not json', '{}', '["invalid"]', '[7]'])('rejects malformed registry version responses: %s', async (response) => {
  await expect(resolveConsumerPeerAliases({ provider: 'npm:semver@>=7.8.5 <8' }, async () => response)).rejects.toThrow('invalid registry version response')
})

it('propagates package-manager query failures before an alias can be installed', async () => {
  await expect(resolveConsumerPeerAliases({ provider: 'npm:semver@>=7.8.5 <8' }, async () => {
    throw new Error('registry unavailable')
  })).rejects.toThrow('registry unavailable')
})
