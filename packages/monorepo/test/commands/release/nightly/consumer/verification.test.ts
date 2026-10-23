import { existsSync, readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
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

it.each(['npm', 'pkg-pr-new'] as const)('limits %s consumer cooldown exceptions to the confirmed npm batch', async (provider) => {
  const h = await consumerFixture({ provider, manifest: { peerDependencies: { provider: 'npm:semver@7.8.5' }, peerDependenciesMeta: { provider: { optional: true } } } })
  // Source policy must not authorize unrelated fresh versions in the consumer.
  await writeFile(path.join(h.root, 'pnpm-workspace.yaml'), 'packages: []\nminimumReleaseAge: 0\nminimumReleaseAgeExclude:\n  - "*"\noverrides:\n  b: 0.0.0\n')
  h.install.mockImplementation((_args, settings) => {
    const policy = parse(readFileSync(path.join(String(settings.cwd), 'pnpm-workspace.yaml'), 'utf8'))
    expect(policy.packages).toEqual([])
    expect(policy).not.toHaveProperty('minimumReleaseAge')
    expect(policy).not.toHaveProperty('overrides')
    if (provider === 'npm') {
      expect(policy.minimumReleaseAgeExclude).toEqual(h.report.packages.map(pkg => `${pkg.name}@${pkg.version}`))
      expect(policy.minimumReleaseAgeExclude).not.toContain('@scope/a@*')
      expect(policy.minimumReleaseAgeExclude).not.toContain('b@0.0.0')
      expect(policy.minimumReleaseAgeExclude).not.toContain('@types/node')
      expect(policy.minimumReleaseAgeExclude).not.toContain('semver@7.8.5')
    }
    else {
      expect(policy).not.toHaveProperty('minimumReleaseAgeExclude')
    }
    return undefined
  })
  await verifyNightlyConsumer(h.report, h.options)
  expect(h.manifest()).toMatchObject({ dependencies: { provider: 'npm:semver@7.8.5' } })
  expect(h.install).toHaveBeenCalledOnce()
  expect(h.report.consumer?.status).toBe('verified')
})

it('still rejects the correct exempt version when its installed snapshot identity differs', async () => {
  const h = await consumerFixture({ mutate: (manifest) => {
    manifest['repoctlSnapshot'] = { ...manifest['repoctlSnapshot'] as object, buildId: 'another-build' }
  } })
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('unexpected version or identity')
  expect(h.spawn).toHaveBeenCalledTimes(2)
  expect(h.report.confirmed).toBe(true)
  expect(h.report.consumer?.status).toBe('failed')
  expect(existsSync(h.installed())).toBe(false)
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
