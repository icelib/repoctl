import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { expect, it } from 'vitest'
import { parseAllDocuments } from 'yaml'
// eslint-disable-next-line antfu/no-import-dist -- Verify the shipped API with a real install.
import { applyWorkspaceRemovalPlan, planWorkspaceRemoval } from '../../../dist/index.mjs'
import { commit, fixture } from './fixture'

it('updates the lockfile only through explicit pnpm and frozen-installs the remaining workspace offline', async () => {
  const h = await fixture({ 'packages/old': { version: '1.0.0' }, 'packages/keep': { dependencies: { old: 'workspace:*' } } })
  const pnpm = (args: string[]) => {
    const result = spawnSync(process.env['npm_execpath'] ?? 'pnpm', args, {
      cwd: h.workspace,
      env: { ...process.env, HOME: h.home, USERPROFILE: h.home, COREPACK_ENABLE_NETWORK: '0', HUSKY: '0' },
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(result.status, `${result.error ?? ''}\n${result.stderr}\n${result.stdout}`).toBe(0)
  }
  const installOptions = ['--offline', '--ignore-scripts', '--store-dir', path.join(h.root, 'store')]
  pnpm(['install', '--lockfile-only', ...installOptions])
  pnpm(['install', '--frozen-lockfile', ...installOptions])
  await commit(h.workspace)
  const originalLock = await readFile(path.join(h.workspace, 'pnpm-lock.yaml'), 'utf8')
  const plan = await planWorkspaceRemoval(h.workspace, { target: 'old', removeReferences: true })
  expect(plan.canApply).toBe(true)
  await applyWorkspaceRemovalPlan(h.workspace, plan)
  expect(await readFile(path.join(h.workspace, 'pnpm-lock.yaml'), 'utf8')).toBe(originalLock)
  pnpm(['install', '--lockfile-only', ...installOptions])
  pnpm(['install', '--frozen-lockfile', ...installOptions])
  const documents = parseAllDocuments(await readFile(path.join(h.workspace, 'pnpm-lock.yaml'), 'utf8')).map(document => document.toJSON())
  const lock = documents.find(document => document.importers)
  expect(Object.keys(lock.importers)).toEqual(['.', 'packages/keep'])
  expect(lock.importers['packages/keep'].dependencies ?? {}).toEqual({})
  const remaining = spawnSync(process.execPath, ['-e', 'console.log(require("./packages/keep"))'], { cwd: h.workspace, encoding: 'utf8' })
  expect(remaining.status, remaining.stderr).toBe(0)
  expect(remaining.stdout.trim()).toBe('42')
}, 90_000)
