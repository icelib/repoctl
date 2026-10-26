import type { PreparedSnapshotPublishReport } from '@icebreakers/monorepo'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { verifyPreparedSnapshotConsumer } from '@icebreakers/monorepo'
import { afterEach, expect, it, vi } from 'vitest'
import { bundle } from './fixture'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const fixture = bundle()
  const directory = await mkdtemp(path.join(os.tmpdir(), 'repoctl-prepared-consumer-'))
  directories.push(directory)
  const report: PreparedSnapshotPublishReport = {
    schemaVersion: 1,
    status: 'published',
    manifest: fixture.manifest,
    evidence: { source: fixture.plan.source, freezeJobId: 1, buildJobId: 2, planArtifact: { id: 3, digest: 'sha256:x' }, buildArtifact: { id: 4, digest: 'sha256:y' }, planDigest: fixture.manifest.planDigest },
    packages: fixture.manifest.packages.map(pkg => ({ name: pkg.name, version: pkg.version, integrity: pkg.integrity, published: true })),
    install: { executable: 'pnpm', args: [] },
    installCommand: '',
    outputDirectory: directory,
  }
  const fetcher = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input))
    const index = Number(url.searchParams.get('index'))
    if (url.pathname.startsWith('/tarballs/')) {
      const pkg = fixture.manifest.packages[Number(url.pathname.split('/')[2])]!
      return new Response(fixture.files.get(pkg.tarball) as Uint8Array<ArrayBuffer>)
    }
    const pkg = fixture.manifest.packages.find(pkg => decodeURIComponent(url.pathname).startsWith(`/${pkg.name}/`)) ?? fixture.manifest.packages[index]!
    return Response.json({ name: pkg.name, version: pkg.version, dist: { integrity: pkg.integrity, tarball: `https://registry.npmjs.org/tarballs/${fixture.manifest.packages.indexOf(pkg)}` } })
  })
  const spawn = vi.fn((_command, args, options) => {
    const cwd = String(options.cwd)
    if (args.includes('--version')) {
      return { status: 0, stdout: '12.14.0', stderr: '' }
    }
    if (args.includes('install')) {
      for (const manifest of fixture.manifests) {
        const target = path.join(cwd, 'node_modules', manifest.name)
        mkdirSync(target, { recursive: true })
        writeFileSync(path.join(target, 'package.json'), JSON.stringify(manifest))
      }
      writeFileSync(path.join(cwd, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', packages: Object.fromEntries(fixture.manifest.packages.map(pkg => [`${pkg.name}@${pkg.version}`, { resolution: { integrity: pkg.integrity } }])) }))
    }
    return { status: 0, stdout: '', stderr: '' }
  })
  return { fixture, directory, report, fetcher, spawn }
}

it('installs exact registry versions in a clean consumer and removes every credential from child processes', async () => {
  const { directory, report, fetcher, spawn } = await setup()
  const result = await verifyPreparedSnapshotConsumer({
    report,
    outputDirectory: directory,
    registryFetch: fetcher,
    spawn: spawn as never,
    env: { PATH: process.env['PATH'], NODE_OPTIONS: '--require=malicious', GITHUB_TOKEN: 'write-token', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-token', NPM_TOKEN: 'npm-secret' },
  })
  expect(result.status).toBe('verified')
  expect(result.packages).toHaveLength(2)
  const install = spawn.mock.calls.find(([, args]) => args.includes('install'))!
  expect(install[1]).toContain('--ignore-scripts')
  expect(install[2].env).not.toHaveProperty('GITHUB_TOKEN')
  expect(install[2].env).not.toHaveProperty('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
  expect(install[2].env).not.toHaveProperty('NPM_TOKEN')
  expect(install[2].env).not.toHaveProperty('NODE_OPTIONS')
  expect(await readdir(directory)).toEqual(['consumer-report.json'])
})

it('rejects altered registry bytes before starting any consumer subprocess', async () => {
  const { directory, report, fetcher, spawn } = await setup()
  const original = fetcher.getMockImplementation()!
  fetcher.mockImplementation(async (input, init) => String(input).includes('/tarballs/') ? new Response('tampered') : original(input, init))
  const result = await verifyPreparedSnapshotConsumer({ report, outputDirectory: directory, registryFetch: fetcher, spawn: spawn as never })
  expect(result.status).toBe('failed')
  expect(result.error).toContain('different bytes')
  expect(spawn).not.toHaveBeenCalled()
})

it('does not verify a partially published batch', async () => {
  const { directory, report, fetcher, spawn } = await setup()
  report.packages[1]!.published = false
  await expect(verifyPreparedSnapshotConsumer({ report, outputDirectory: directory, registryFetch: fetcher, spawn: spawn as never })).rejects.toThrow('fully confirmed')
  expect(fetcher).not.toHaveBeenCalled()
  expect(spawn).not.toHaveBeenCalled()
})

it('validates every installed package before executing the first candidate entrypoint', async () => {
  const h = await setup()
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, options) => {
    const result = original(command, args, options)
    if (args.includes('install')) {
      const manifest = { ...h.fixture.manifests[1], version: '0.0.0' }
      writeFileSync(path.join(String(options.cwd), 'node_modules', manifest.name!, 'package.json'), JSON.stringify(manifest))
    }
    return result
  })
  const result = await verifyPreparedSnapshotConsumer({ report: h.report, outputDirectory: h.directory, registryFetch: h.fetcher, spawn: h.spawn as never })
  expect(result.status).toBe('failed')
  expect(result.error).toContain('unexpected identity')
  expect(h.spawn.mock.calls.some(([, args]) => args.includes('--eval'))).toBe(false)
})

it('binds each installed lockfile integrity to its exact package name and version', async () => {
  const h = await setup()
  const original = h.spawn.getMockImplementation()!
  h.spawn.mockImplementation((command, args, options) => {
    const result = original(command, args, options)
    if (args.includes('install')) {
      const packages = Object.fromEntries(h.fixture.manifest.packages.map((pkg, index) => [`${pkg.name}@${pkg.version}`, { resolution: { integrity: h.fixture.manifest.packages[1 - index]!.integrity } }]))
      writeFileSync(path.join(String(options.cwd), 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', packages }))
    }
    return result
  })
  const result = await verifyPreparedSnapshotConsumer({ report: h.report, outputDirectory: h.directory, registryFetch: h.fetcher, spawn: h.spawn as never })
  expect(result.status).toBe('failed')
  expect(result.error).toContain('verified integrity')
  expect(h.spawn.mock.calls.some(([, args]) => args.includes('--eval'))).toBe(false)
})

it('retries confirmed registry visibility and installs with fresh isolated caches', async () => {
  const h = await setup()
  const fetcher = h.fetcher.getMockImplementation()!
  let metadataMissing = true
  h.fetcher.mockImplementation(async (input, init) => {
    if (metadataMissing) {
      metadataMissing = false
      return new Response(null, { status: 404 })
    }
    return fetcher(input, init)
  })
  const spawn = h.spawn.getMockImplementation()!
  let packumentMissing = true
  h.spawn.mockImplementation((command, args, options) => {
    if (args.includes('install') && packumentMissing) {
      packumentMissing = false
      const pkg = h.report.packages[0]!
      return { status: 1, stdout: JSON.stringify({ level: 'error', code: 'ERR_PNPM_NO_MATCHING_VERSION', message: `No matching version found for ${pkg.name}@${pkg.version} while fetching it from https://registry.npmjs.org/` }), stderr: '' }
    }
    return spawn(command, args, options)
  })
  const sleep = vi.fn(async () => {})
  const result = await verifyPreparedSnapshotConsumer({ report: h.report, outputDirectory: h.directory, registryFetch: h.fetcher, spawn: h.spawn as never, sleep })
  expect(result.status).toBe('verified')
  expect(sleep).toHaveBeenCalledTimes(2)
  const installs = h.spawn.mock.calls.filter(([, args]) => args.includes('install'))
  expect(installs).toHaveLength(2)
  const stores = installs.map(([, args]) => args.find((arg: string) => arg.startsWith('--store-dir=')))
  expect(stores[0]).not.toBe(stores[1])
  expect(installs.every(([, args]) => args.includes('--ignore-scripts') && args.includes('--no-offline'))).toBe(true)
})

it('fails registry authentication errors immediately without consumer execution or retry', async () => {
  const h = await setup()
  h.fetcher.mockResolvedValue(new Response(null, { status: 403 }))
  const sleep = vi.fn(async () => {})
  const result = await verifyPreparedSnapshotConsumer({ report: h.report, outputDirectory: h.directory, registryFetch: h.fetcher, spawn: h.spawn as never, sleep })
  expect(result.status).toBe('failed')
  expect(result.error).toContain('HTTP 403')
  expect(sleep).not.toHaveBeenCalled()
  expect(h.spawn).not.toHaveBeenCalled()
})
