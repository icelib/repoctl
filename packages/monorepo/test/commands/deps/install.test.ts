import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { applyDependencyFixPlan, planDependencyFix } from '@icebreakers/monorepo'
import path from 'pathe'
import { expect, it } from 'vitest'
import { fixture, writeJson } from './fixture'

it('installs an applied fixture through explicit offline pnpm lockfile and frozen-install steps', async () => {
  const h = await fixture({ 'packages/a': { dependencies: { 'repoctl-fixture-dep': '^1.0.0' } }, 'packages/b': { dependencies: { 'repoctl-fixture-dep': '~1.1.0' } } })
  const source = path.join(h.root, 'source')
  await writeJson(path.join(source, 'package.json'), { name: 'repoctl-fixture-dep', version: '1.1.0', main: 'index.js' })
  await writeFile(path.join(source, 'index.js'), 'module.exports = 42\n')
  const env = { ...process.env, HOME: h.home, USERPROFILE: h.home, COREPACK_ENABLE_NETWORK: '0', HUSKY: '0' }
  const pnpm = (args: string[], cwd = h.workspace) => {
    const result = spawnSync(process.env['npm_execpath'] ?? 'pnpm', args, { cwd, env, encoding: 'utf8', timeout: 30_000 })
    expect(result.status, `${result.error ?? ''}\n${result.stderr}\n${result.stdout}`).toBe(0)
    return result
  }
  pnpm(['pack', '--pack-destination', h.root], source)
  await writeFile(path.join(h.workspace, 'pnpm-workspace.yaml'), 'packages: [packages/*]\noverrides:\n  repoctl-fixture-dep: file:../repoctl-fixture-dep-1.1.0.tgz\n')
  const plan = await planDependencyFix(h.workspace, { dependency: 'repoctl-fixture-dep', section: 'dependencies', to: '^1.1.0' })
  await applyDependencyFixPlan(h.workspace, plan)
  const installOptions = ['--offline', '--ignore-scripts', '--store-dir', path.join(h.root, 'store')]
  pnpm(['install', '--lockfile-only', ...installOptions])
  pnpm(['install', '--frozen-lockfile', ...installOptions])
  for (const name of ['a', 'b']) {
    const manifest = JSON.parse(await readFile(path.join(h.workspace, 'packages', name, 'node_modules/repoctl-fixture-dep/package.json'), 'utf8'))
    expect(manifest.version).toBe('1.1.0')
  }
}, 90_000)
