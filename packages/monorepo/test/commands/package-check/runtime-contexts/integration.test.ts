import type { PackedManifest } from '../../../../src/commands/package-check/types'
import { spawnSync } from 'node:child_process'
import { readFile, realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the shipped package consumer.
import { checkPackages } from '../../../../dist/index.mjs'
import { checkInstalledEntries } from '../../../../src/commands/release/nightly/consumer/entries'
import { addPackage, fixture } from '../fixtures'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))))

async function installedEntries(directory: string, name: string, files: string[]) {
  const installed = await realpath(path.join(directory, 'node_modules', name))
  const manifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8')) as PackedManifest
  return checkInstalledEntries(manifest, files, installed, directory, async (command, args) => {
    const completed = spawnSync(command, args, { cwd: directory, encoding: 'utf8' })
    if (completed.status !== 0 || completed.error) {
      throw completed.error ?? new Error(completed.stderr)
    }
    return completed.stdout
  }, 0)
}

it.each([
  ['throw new Error("requires its build plugin")', true],
  ['export const routes = []', false],
  ['throw new Error("different failure")', false],
] as const)('runs guarded exports through both packed and installed consumers: %s', async (source, valid) => {
  const cwd = await fixture()
  roots.push(cwd)
  const name = 'fixture-guard-context'
  await addPackage(cwd, name, {
    exports: './dist/index.mjs',
    repoctl: { packageCheck: { runtimeContexts: { '.': { kind: 'expected-error', name: 'Error', message: 'requires its build plugin' } } } },
  }, { 'dist/index.mjs': source })
  const report = await checkPackages({ cwd, keepTemp: true })
  roots.push(report.temporaryDirectory!)
  expect(report.status, JSON.stringify(report, null, 2)).toBe(valid ? 'passed' : 'failed')
  const promise = installedEntries(path.join(report.temporaryDirectory!, 'consumers/0'), name, report.packages[0]!.files)
  if (valid) {
    await expect(promise).resolves.toBeUndefined()
  }
  else {
    expect(report.packages[0]!.diagnostics).toContainEqual(expect.objectContaining({ code: 'RUNTIME_IMPORT', message: expect.stringContaining('declared unavailable-runtime error') }))
    await expect(promise).rejects.toThrow('declared unavailable-runtime error')
  }
}, 120_000)

it.each(['declared', 'ordinary-node', 'broken-hook'] as const)('executes a real Vitest setup and smoke lifecycle in both consumers: %s', async (kind) => {
  const cwd = await fixture()
  roots.push(cwd)
  const name = 'fixture-vitest-context'
  const runtimeContexts = kind === 'ordinary-node' ? undefined : { '.': 'vitest' }
  await addPackage(cwd, name, {
    exports: './dist/index.mjs',
    peerDependencies: { vitest: '^5.0.5' },
    peerDependenciesMeta: { vitest: { optional: true } },
    repoctl: { packageCheck: { runtimeContexts } },
  }, {
    'dist/index.mjs': kind === 'broken-hook'
      ? 'import { beforeAll } from "vitest"; beforeAll(() => { throw new Error("setup lifecycle sentinel") });'
      : 'import { beforeAll, vi } from "vitest"; vi.stubGlobal("repoctlContext", true); beforeAll(() => { if (!globalThis.repoctlContext) throw new Error("setup not executed") });',
  })
  const report = await checkPackages({ cwd, keepTemp: true })
  roots.push(report.temporaryDirectory!)
  const valid = kind === 'declared'
  expect(report.status, JSON.stringify(report, null, 2)).toBe(valid ? 'passed' : 'failed')
  const promise = installedEntries(path.join(report.temporaryDirectory!, 'consumers/0'), name, report.packages[0]!.files)
  if (valid) {
    await expect(promise).resolves.toBeUndefined()
    expect(report.packages[0]!.commands.some(command => command.args.some(arg => arg.endsWith('run.mjs')))).toBe(true)
  }
  else {
    await expect(promise).rejects.toThrow(kind === 'broken-hook' ? 'setup lifecycle sentinel' : /Vitest/u)
    expect(report.packages[0]!.diagnostics).toContainEqual(expect.objectContaining({ code: 'RUNTIME_IMPORT' }))
  }
}, 120_000)

it('keeps strict declaration validation for a runtime context', async () => {
  const cwd = await fixture()
  roots.push(cwd)
  await addPackage(cwd, 'fixture-typed-guard-context', {
    exports: { types: './dist/index.d.mts', import: './dist/index.mjs' },
    repoctl: { packageCheck: { runtimeContexts: { '.': { kind: 'expected-error', name: 'Error', message: 'guard' } } } },
  }, {
    'dist/index.mjs': 'throw new Error("guard")',
    'dist/index.d.mts': 'export interface Invalid { [key: string]: string; enabled: boolean }',
  })
  const report = await checkPackages({ cwd })
  expect(report.status).toBe('failed')
  expect(report.packages[0]!.diagnostics).toContainEqual(expect.objectContaining({ code: 'TYPESCRIPT_CONSUMER', message: expect.stringContaining('TS2411') }))
}, 120_000)
