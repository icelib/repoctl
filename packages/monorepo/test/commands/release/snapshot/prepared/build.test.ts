import type { SnapshotBuildPlanOptions } from '@icebreakers/monorepo'
import { existsSync } from 'node:fs'
import { readdir, readFile, rename, symlink } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createSnapshotBuildPlan, prepareSnapshot } from '@icebreakers/monorepo'
import { afterEach, expect, it, vi } from 'vitest'
import { validatePreparedSnapshot } from '../../../../../src/commands/release/snapshot/prepared/validate'
import { fixture, snapshot } from '../fixture'
import { source } from './fixture'

afterEach(() => vi.unstubAllEnvs())

async function bundleFiles(directory: string, prefix = ''): Promise<Array<[string, Uint8Array]>> {
  const files: Array<[string, Uint8Array]> = []
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...await bundleFiles(directory, relative))
    }
    else {
      files.push([relative, await readFile(path.join(directory, relative))])
    }
  }
  return files
}

it('freezes native versions and dependency edges, then validates the same prepared bytes after relocating away from all source files', async () => {
  const hostCredentials = {
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'host-oidc-token',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.invalid/host-oidc',
    NODE_AUTH_TOKEN: 'host-node-auth-token',
    NPM_TOKEN: 'host-npm-token',
  }
  for (const [key, value] of Object.entries(hostCredentials)) {
    vi.stubEnv(key, value)
  }
  const h = await fixture()
  for (const [key, value] of Object.entries(hostCredentials)) {
    expect(h.env).not.toHaveProperty(key)
    expect(h.options.env).not.toHaveProperty(key)
    expect(process.env[key]).toBe(value)
  }
  const before = await snapshot(h.cwd)
  const options = { cwd: h.cwd, source: source(h.options.identity.commit), env: h.options.env!, spawn: h.options.spawn! }
  const plan = await createSnapshotBuildPlan(options)
  expect(plan.packages.map(pkg => pkg.name)).toEqual(['snapshot-a', 'snapshot-b'])
  expect(plan.packages[0]!.version).toMatch(/^1\.0\.1-snapshot\.pr\.42\./)
  expect(plan.packages[1]!.dependencies).toEqual([{ field: 'dependencies', alias: 'snapshot-a', name: 'snapshot-a', version: plan.packages[0]!.version }])
  expect(await snapshot(h.cwd)).toEqual(before)
  const prepared = await prepareSnapshot({ ...options, plan, outputDirectory: path.join(h.root, 'prepared-output') })
  expect(h.uploads).toEqual([])
  expect(await snapshot(h.cwd)).toEqual(before)
  const moved = path.join(h.root, 'portable-artifact')
  await rename(prepared.directory, moved)
  const files = new Map(await bundleFiles(moved))
  expect([...files.keys()].sort()).toEqual(['snapshot-manifest.json', 'tarballs/0/package.tgz', 'tarballs/1/package.tgz'])
  expect(await validatePreparedSnapshot(prepared.manifest, plan, files)).toEqual(prepared.manifest)
}, 180_000)

it('rejects frozen-plan drift and credentials before candidate installation', async () => {
  const h = await fixture()
  const options = { cwd: h.cwd, source: source(h.options.identity.commit), env: h.options.env!, spawn: h.options.spawn! }
  const plan = await createSnapshotBuildPlan(options)
  const before = await snapshot(h.cwd)
  const drifted = structuredClone(plan)
  drifted.packages[0]!.reasons = ['not-the-frozen-intent']
  await expect(prepareSnapshot({ ...options, plan: drifted, outputDirectory: path.join(h.root, 'not-created') })).rejects.toThrow('trusted frozen plan')
  for (const key of ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN']) {
    await expect(prepareSnapshot({ ...options, plan, outputDirectory: path.join(h.root, 'not-created'), env: { ...h.options.env, [key]: 'unexpected-credential' } })).rejects.toThrow('without OIDC')
  }
  expect(await snapshot(h.cwd)).toEqual(before)
  expect(h.uploads).toEqual([])
}, 60_000)

it('freezes without executing repository configuration, pnpmfile or package lifecycle scripts', async () => {
  const h = await fixture()
  const marker = path.join(h.root, 'candidate-executed')
  const trap = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); throw new Error('Candidate hook must not execute while freezing')`
  await h.write('.pnpmfile.cjs', trap)
  await h.write('repoctl.config.cjs', trap)
  const root = JSON.parse(await readFile(path.join(h.cwd, 'package.json'), 'utf8'))
  await h.write('package.json', JSON.stringify({ ...root, scripts: { ...root.scripts, preinstall: 'node .pnpmfile.cjs', preversion: 'node .pnpmfile.cjs', version: 'node .pnpmfile.cjs' } }))
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'trapped executable configuration'])
  const plan = await createSnapshotBuildPlan({ cwd: h.cwd, source: source(h.run('git', ['rev-parse', 'HEAD'])), env: h.options.env!, spawn: h.options.spawn! })
  expect(plan.packages).toHaveLength(2)
  expect(existsSync(marker)).toBe(false)
}, 60_000)

it('rejects committed source links before any candidate workspace scan', async () => {
  const h = await fixture()
  if (process.platform === 'win32') {
    return
  }
  await symlink('../outside', path.join(h.cwd, 'escape'))
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'linked source'])
  await expect(createSnapshotBuildPlan({ cwd: h.cwd, source: source(h.run('git', ['rev-parse', 'HEAD'])), env: h.options.env!, spawn: h.options.spawn! })).rejects.toThrow('symbolic links')
}, 60_000)

it('rejects a trusted pnpm runtime that differs from the frozen packageManager pin', async () => {
  const h = await fixture()
  const spawn: NonNullable<SnapshotBuildPlanOptions['spawn']> = ((command, args, settings) => {
    if (command === 'pnpm' && args?.includes('--version')) {
      return { status: 0, signal: null, stdout: '12.13.0\n', stderr: '', pid: 1, output: [null, '12.13.0\n', ''] }
    }
    return h.options.spawn!(command, args ?? [], settings as Parameters<NonNullable<SnapshotBuildPlanOptions['spawn']>>[2])
  }) as NonNullable<SnapshotBuildPlanOptions['spawn']>
  await expect(createSnapshotBuildPlan({ cwd: h.cwd, source: source(h.options.identity.commit), env: h.options.env!, spawn })).rejects.toThrow('trusted pnpm version')
  expect(h.uploads).toEqual([])
}, 60_000)
