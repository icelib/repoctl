import type { BootstrapOptions } from '../../../../src/commands/release/bootstrap/types'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { verifyBootstrapConsumer } from '../../../../src/commands/release/bootstrap/consumer'
import { readSnapshotArchive } from '../../../../src/commands/release/snapshot/archive'
import { boundaryFixture, jsonResponse } from './boundary-fixture'

vi.mock('../../../../src/commands/package-check/consumer/typescript', () => ({
  consumerTypeToolchain: async () => ({ devDependencies: { 'repoctl-consumer-typescript': 'npm:typescript@6.0.3' } }),
  installedConsumerTypeToolchain: async (directory: string) => ({ tsc: path.join(directory, 'tools/tsc'), nodeTypes: 'node', typeRoots: path.join(directory, 'types') }),
}))

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const h = boundaryFixture()
  const outputDirectory = await mkdtemp(path.join(tmpdir(), 'bootstrap-consumer-test-'))
  directories.push(outputDirectory)
  h.report.outputDirectory = outputDirectory
  h.report.confirmed = true
  const tarball = `https://registry.npmjs.org/@acme/preview/-/preview-${h.manifest.package.version}.tgz`
  const entries = await readSnapshotArchive(h.bytes)
  let consumer = ''
  let installed = ''
  const install = vi.fn((_cwd: string) => {})
  const spawn = vi.fn((command: string, args: string[], settings: { cwd: string, env: NodeJS.ProcessEnv }) => {
    consumer = settings.cwd
    if (command === 'npm' && args[0] === 'install') {
      installed = path.join(consumer, 'node_modules', h.manifest.package.name)
      for (const entry of entries.filter(entry => entry.type === 'File')) {
        const file = path.join(installed, entry.path.slice('package/'.length))
        mkdirSync(path.dirname(file), { recursive: true })
        writeFileSync(file, entry.data)
      }
      writeFileSync(path.join(consumer, 'package-lock.json'), JSON.stringify({ packages: { [`node_modules/${h.manifest.package.name}`]: { version: h.manifest.package.version, integrity: h.manifest.package.integrity, resolved: tarball } } }))
      install(consumer)
    }
    return { status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [null, '', ''] }
  })
  const registryFetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    if (String(input) === tarball) {
      return new Response(Uint8Array.from(h.bytes))
    }
    return jsonResponse({ name: h.manifest.package.name, version: h.manifest.package.version, dist: { tarball, integrity: h.manifest.package.integrity } })
  })
  const options: BootstrapOptions = {
    ...h.options,
    registryFetch: registryFetch as typeof fetch,
    spawn: spawn as unknown as NonNullable<BootstrapOptions['spawn']>,
    env: { ...process.env, NPM_TOKEN: 'must-not-inherit', NODE_AUTH_TOKEN: 'must-not-inherit', NODE_OPTIONS: '--import=must-not-load', GITHUB_TOKEN: 'must-not-inherit', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'must-not-inherit' },
  }
  return { ...h, options, registryFetch, spawn, install, consumer: () => consumer, installed: () => installed }
}

it('installs the exact registry version, verifies signatures before imports, checks strict types and cleans up', async () => {
  const h = await fixture()
  let consumerManifest: unknown
  h.install.mockImplementation((cwd) => {
    consumerManifest = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8'))
  })
  await verifyBootstrapConsumer(h.report, h.options)
  expect(h.report.consumer).toMatchObject({ status: 'passed', packages: [{ name: h.manifest.package.name, version: h.manifest.package.version }] })
  expect(consumerManifest).toMatchObject({ dependencies: { '@acme/preview': '0.1.0-alpha.0' } })
  expect(h.spawn.mock.calls[0]?.slice(0, 2)).toEqual(['npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry', h.manifest.registry]])
  expect(h.spawn.mock.calls[1]?.slice(0, 2)).toEqual(['npm', ['audit', 'signatures', '--registry', h.manifest.registry]])
  expect(h.spawn.mock.calls.some(([command, args]) => command === process.execPath && args.includes('--eval'))).toBe(true)
  expect(h.spawn.mock.calls.some(([, args]) => args.includes('--strict') && args.includes('false') && args.includes('nodenext'))).toBe(true)
  for (const [, , settings] of h.spawn.mock.calls) {
    for (const key of ['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'NODE_OPTIONS', 'GITHUB_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']) {
      expect(settings.env).not.toHaveProperty(key)
    }
    expect(settings.env['npm_config_cache']).toBe(path.join(h.consumer(), '.npm-cache'))
  }
  expect(existsSync(h.consumer())).toBe(false)
  expect(JSON.parse(await readFile(path.join(h.report.outputDirectory!, 'consumer-report.json'), 'utf8'))).toEqual(h.report.consumer)
})

it('rejects substituted registry bytes before starting any consumer command', async () => {
  const h = await fixture()
  h.manifest.package.integrity = `sha512-${'A'.repeat(86)}==`
  await expect(verifyBootstrapConsumer(h.report, h.options)).rejects.toThrow('integrity')
  expect(h.spawn).not.toHaveBeenCalled()
  expect(h.report.consumer?.status).toBe('failed')
})

it.each(['version', 'integrity', 'resolved'] as const)('rejects a substituted lockfile %s before imports or signatures', async (field) => {
  const h = await fixture()
  h.install.mockImplementation((cwd) => {
    const file = path.join(cwd, 'package-lock.json')
    const lock = JSON.parse(readFileSync(file, 'utf8')) as { packages: Record<string, Record<string, string>> }
    lock.packages[`node_modules/${h.manifest.package.name}`]![field] = 'substituted'
    writeFileSync(file, JSON.stringify(lock))
  })
  await expect(verifyBootstrapConsumer(h.report, h.options)).rejects.toThrow()
  expect(h.spawn).toHaveBeenCalledOnce()
  expect(existsSync(h.consumer())).toBe(false)
})

it('rejects modified installed files before running package entries', async () => {
  const h = await fixture()
  h.install.mockImplementation(() => {
    writeFileSync(path.join(h.installed(), 'index.js'), 'throw new Error("substitution")')
  })
  await expect(verifyBootstrapConsumer(h.report, h.options)).rejects.toThrow('Installed bootstrap file differs')
  expect(h.spawn).toHaveBeenCalledOnce()
  expect(existsSync(h.consumer())).toBe(false)
})

it.each(['signatures', 'runtime', 'types'])('retains a %s failure and never reports verification passed', async (stage) => {
  const h = await fixture()
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, settings) => {
    const response = original(command, args, settings)
    if ((stage === 'signatures' && args.includes('signatures')) || (stage === 'runtime' && args.includes('--eval')) || (stage === 'types' && args.includes('--strict'))) {
      return { ...response, status: 1, stderr: `${stage} failed` }
    }
    return response
  })
  await expect(verifyBootstrapConsumer(h.report, h.options)).rejects.toThrow(`${stage} failed`)
  expect(h.report.consumer).toMatchObject({ status: 'failed', commands: expect.arrayContaining([expect.objectContaining({ exitCode: 1 })]) })
  expect(h.report.confirmed).toBe(true)
  expect(existsSync(h.consumer())).toBe(false)
})
