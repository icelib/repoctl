import { expect, it } from 'vitest'
import { verifyNightlyConsumer } from '../../../../../src/commands/release/nightly/consumer'
import { consumerFixture } from './fixture'

it.each(['npm', 'pkg-pr-new'] as const)('installs required workspace peer aliases using the current %s publication locators', async (provider) => {
  const h = await consumerFixture({
    provider,
    configure: (manifest, index) => {
      if (index === 1) {
        manifest['peerDependencies'] = { 'provider-alias': `npm:@scope/a@${String(manifest['version'])}` }
      }
    },
  })
  await verifyNightlyConsumer(h.report, h.options)
  const host = h.report.packages[0]!
  const dependencies = h.manifest()['dependencies'] as Record<string, string>
  expect(dependencies['provider-alias']).toBe(provider === 'npm' ? `npm:${host.name}@snapshot-nightly` : host.locator)
  expect(h.report.consumer?.status).toBe('verified')
  expect(h.report.consumer?.packages).toHaveLength(2)
})
