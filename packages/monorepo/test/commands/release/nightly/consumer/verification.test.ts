import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { verifyNightlyConsumer } from '../../../../../src/commands/release/nightly/consumer'
import { consumerFixture } from './fixture'

it.each(['npm', 'pkg-pr-new'] as const)('installs the real %s channel with no overrides, checks all entries, and retains diagnostics', async (provider) => {
  const h = await consumerFixture({ provider })
  await verifyNightlyConsumer(h.report, h.options)
  expect(h.report.consumer?.status).toBe('verified')
  expect(h.report.consumer?.packages).toHaveLength(2)
  expect(h.manifest()).toMatchObject({ dependencies: Object.fromEntries(h.report.packages.map(pkg => [pkg.name, provider === 'npm' ? 'snapshot-nightly' : pkg.locator])) })
  expect(h.manifest()).not.toHaveProperty('pnpm')
  expect(h.spawn.mock.calls.filter(([, args]) => args?.includes('--eval'))).toHaveLength(2)
  expect(h.spawn.mock.calls.filter(([, args]) => args?.includes('--check'))).toHaveLength(2)
  for (const [, , settings] of h.spawn.mock.calls) {
    expect(settings?.env).not.toHaveProperty('NPM_TOKEN')
    expect(settings?.env).not.toHaveProperty('NODE_OPTIONS')
    expect(settings?.env).not.toHaveProperty('NODE_PATH')
    expect(settings?.env).not.toHaveProperty('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
  }
  expect(existsSync(h.installed())).toBe(false)
  expect(JSON.parse(await readFile(path.join(h.report.outputDirectory!, 'consumer-report.json'), 'utf8'))).toEqual(h.report.consumer)
})

it('verifies every installed identity before executing any package entry', async () => {
  const h = await consumerFixture({ mutate: (manifest) => {
    if (manifest['name'] === 'b') {
      manifest['version'] = '0.0.0'
    }
  } })
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('unexpected version or identity')
  expect(h.spawn).toHaveBeenCalledTimes(2)
  expect(existsSync(h.installed())).toBe(false)
})

it('requires confirmation and refuses executable paths outside the installed package', async () => {
  const h = await consumerFixture({ escapeBin: true })
  h.report.confirmed = false
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('confirmed publication')
  expect(h.spawn).not.toHaveBeenCalled()
  h.report.confirmed = true
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('outside its isolated package')
  expect(h.spawn.mock.calls.some(([, args]) => args?.includes('--check'))).toBe(false)
  expect(existsSync(h.installed())).toBe(false)
})

it('records subprocess failure and cleans up the isolated installation', async () => {
  const h = await consumerFixture()
  h.spawn.mockReturnValueOnce({ status: 1, stdout: '', stderr: 'pnpm failed', pid: 1, signal: null, output: [null, '', 'pnpm failed'] })
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('pnpm failed')
  expect(h.report.consumer).toMatchObject({ status: 'failed', commands: [{ exitCode: 1 }] })
  expect(existsSync(String(h.spawn.mock.calls[0]?.[2]?.cwd))).toBe(false)
})
