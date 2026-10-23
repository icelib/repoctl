import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { satisfies } from 'semver'
import { expect, it } from 'vitest'
import { verifyNightlyConsumer } from '../../../../../src/commands/release/nightly/consumer'
import { consumerFixture } from './fixture'

it('derives optional integrations from checked tarballs rather than source manifests', async () => {
  const h = await consumerFixture({ manifest: { peerDependencies: { provider: 'npm:semver@^7.8.5' }, peerDependenciesMeta: { provider: { optional: true } } } })
  const source = JSON.parse(await readFile(path.join(h.root, 'package.json'), 'utf8'))
  source.devDependencies = { 'unrelated-development-dependency': '*' }
  source.peerDependencies = { rogue: '*' }
  source.peerDependenciesMeta = { rogue: { optional: true } }
  await writeFile(path.join(h.root, 'package.json'), JSON.stringify(source))
  await verifyNightlyConsumer(h.report, h.options)
  const dependencies = h.manifest()['dependencies'] as Record<string, string>
  expect(dependencies['provider']).toMatch(/^npm:semver@/u)
  expect(satisfies('7.8.5', dependencies['provider']!.slice('npm:semver@'.length))).toBe(true)
  expect(dependencies).not.toHaveProperty('rogue')
  expect(dependencies).not.toHaveProperty('unrelated-development-dependency')
  expect(h.manifest()).not.toHaveProperty('devDependencies')
})

it('rejects changed tarball bytes before installing or executing any consumers', async () => {
  const h = await consumerFixture()
  await writeFile(h.report.snapshot!.packages[0]!.tarball!, 'tampered artifact')
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('tarball integrity changed')
  expect(h.spawn).not.toHaveBeenCalled()
  expect(h.report.consumer?.status).toBe('failed')
})

it('rejects a tarball whose recorded package identity no longer matches the publication', async () => {
  const h = await consumerFixture()
  h.report.snapshot!.packages[0]!.version = '0.0.0'
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('tarball identity changed')
  expect(h.spawn).not.toHaveBeenCalled()
})

it.each([
  ['self.addEventListener("fetch", () => {});', true],
  ['function {', false],
] as const)('runs real resource resolution and syntax checks after publication: %s', async (worker, valid) => {
  const h = await consumerFixture({
    manifest: { exports: { '.': './index.js', './worker.js': './worker.js' }, repoctl: { packageCheck: { runtimeAssets: ['./worker.js'] } } },
    files: { 'worker.js': worker },
  })
  h.options.spawn = ((command, args, settings) => {
    if (args?.includes('--eval') || args?.includes('--check')) {
      return spawnSync(command, args, { ...settings, encoding: 'utf8' })
    }
    return h.spawn(command, args ?? [], settings ?? {})
  }) as NonNullable<typeof h.options.spawn>
  if (valid) {
    await verifyNightlyConsumer(h.report, h.options)
    expect(h.report.consumer?.status).toBe('verified')
  }
  else {
    await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('SyntaxError')
    expect(h.report.consumer?.status).toBe('failed')
  }
})
