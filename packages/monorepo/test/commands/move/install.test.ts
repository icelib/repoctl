import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Exercise the packed entrypoint with real pnpm installs.
import { applyWorkspaceMovePlan, planWorkspaceMove } from '../../../dist/index.mjs'
import { commit, fixture } from './fixture'

it.each([{ to: 'libs/core' }, { name: '@org/core' }, { to: 'libs/core', name: '@org/core' }])('installs and builds consumer aliases after migration: %j', async (options) => {
  const h = await fixture({
    'packages/old': { version: '1.0.0', main: 'index.js' },
    'packages/app': { dependencies: { api: 'workspace:old@*' }, scripts: { build: 'node build.cjs' } },
  })
  await writeFile(path.join(h.workspace, 'packages/app/build.cjs'), 'require("node:assert/strict").equal(require("api"), 42)\n')
  const pnpm = (args: string[]) => {
    const result = spawnSync(process.env['npm_execpath'] ?? 'pnpm', args, {
      cwd: h.workspace,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, HOME: h.home, USERPROFILE: h.home, COREPACK_ENABLE_NETWORK: '0', HUSKY: '0' },
    })
    expect(result.status, `${result.error ?? ''}\n${result.stderr}\n${result.stdout}`).toBe(0)
  }
  const install = ['--offline', '--ignore-scripts', '--store-dir', path.join(h.root, 'store')]
  pnpm(['install', '--lockfile-only', ...install])
  pnpm(['install', '--frozen-lockfile', ...install])
  await commit(h.workspace)
  const lockfile = await readFile(path.join(h.workspace, 'pnpm-lock.yaml'), 'utf8')
  const plan = await planWorkspaceMove(h.workspace, { target: 'old', ...options })
  expect(plan.canApply).toBe(true)
  await applyWorkspaceMovePlan(h.workspace, plan)
  expect(await readFile(path.join(h.workspace, 'pnpm-lock.yaml'), 'utf8')).toBe(lockfile)
  pnpm(['install', '--lockfile-only', ...install])
  pnpm(['install', '--frozen-lockfile', ...install])
  pnpm(['--filter', 'app', 'build'])
}, 90_000)
