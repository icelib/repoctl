import type { NightlyOptions } from '@icebreakers/monorepo'
import type { SpawnSyncOptions, SpawnSyncReturns } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { verifyNightlyConsumer } from '../../../../src/commands/release/nightly/consumer'
import { snapshotMetadata } from '../../../../src/commands/release/snapshot/identity'
import { reportFixture } from './provider-fixture'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))))

async function fixture(provider: 'npm' | 'pkg-pr-new' = 'npm', mutate?: (manifest: Record<string, unknown>) => void, escapeBin = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'repoctl-nightly-consumer-test-'))
  roots.push(root)
  await writeFile(path.join(root, 'package.json'), '{"packageManager":"pnpm@12.13.0"}')
  const report = reportFixture(provider)
  report.confirmed = true
  report.outputDirectory = root
  report.snapshot!.checks = report.packages.map(pkg => ({ name: pkg.name, files: ['package.json', 'index.js', 'bin.js'] })) as NonNullable<NonNullable<typeof report.snapshot>['checks']>
  let installed = ''
  let consumerManifest: Record<string, unknown> = {}
  const spawn = vi.fn((_command: string, args: readonly string[], settings: SpawnSyncOptions): SpawnSyncReturns<string> => {
    const done = (stdout = ''): SpawnSyncReturns<string> => ({ status: 0, stdout, stderr: '', pid: 1, signal: null, output: [null, stdout, ''] })
    if (args?.includes('--version')) {
      return done('12.13.0\n')
    }
    if (args?.includes('install')) {
      installed = String(settings?.cwd)
      consumerManifest = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'))
      for (const pkg of report.packages) {
        const directory = path.join(installed, 'node_modules', pkg.name)
        mkdirSync(directory, { recursive: true })
        const manifest = { name: pkg.name, version: pkg.version, type: 'module', exports: './index.js', bin: 'bin.js', repoctlSnapshot: snapshotMetadata(report.snapshot!) }
        mutate?.(manifest)
        writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest))
        writeFileSync(path.join(directory, 'index.js'), 'export const value = 1')
        if (escapeBin) {
          symlinkSync(path.join(root, 'package.json'), path.join(directory, 'bin.js'))
        }
        else {
          writeFileSync(path.join(directory, 'bin.js'), '')
        }
      }
    }
    return done()
  })
  const options: NightlyOptions = { cwd: root, spawn: spawn as unknown as NightlyOptions['spawn'] & {}, env: { ...process.env, NPM_TOKEN: 'secret', NODE_PATH: root, NODE_OPTIONS: '--require=source-hook', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'secret' } }
  return { report, options, spawn, installed: () => installed, manifest: () => consumerManifest }
}

it.each(['npm', 'pkg-pr-new'] as const)('installs the real %s channel with no overrides, checks all entries, and retains diagnostics', async (provider) => {
  const h = await fixture(provider)
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
  const h = await fixture('npm', (manifest) => {
    if (manifest['name'] === 'b') {
      manifest['version'] = '0.0.0'
    }
  })
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('unexpected version or identity')
  expect(h.spawn).toHaveBeenCalledTimes(2)
  expect(existsSync(h.installed())).toBe(false)
})

it('requires confirmation and refuses executable paths outside the installed package', async () => {
  const h = await fixture('npm', undefined, true)
  h.report.confirmed = false
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('confirmed publication')
  expect(h.spawn).not.toHaveBeenCalled()
  h.report.confirmed = true
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('outside its isolated package')
  expect(h.spawn.mock.calls.some(([, args]) => args?.includes('--check'))).toBe(false)
  expect(existsSync(h.installed())).toBe(false)
})

it('records subprocess failure and cleans up the isolated installation', async () => {
  const h = await fixture()
  h.spawn.mockReturnValueOnce({ status: 1, stdout: '', stderr: 'pnpm failed', pid: 1, signal: null, output: [null, '', 'pnpm failed'] })
  await expect(verifyNightlyConsumer(h.report, h.options)).rejects.toThrow('pnpm failed')
  expect(h.report.consumer).toMatchObject({ status: 'failed', commands: [{ exitCode: 1 }] })
  expect(existsSync(String(h.spawn.mock.calls[0]?.[2]?.cwd))).toBe(false)
})
