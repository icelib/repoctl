import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import crossSpawn from 'cross-spawn'
import { expect, it } from 'vitest'
import { fixture } from './fixture'

it('routes the built nightly CLI and emits one parseable JSON report without contacting a registry for private workspaces', async () => {
  const h = await fixture()
  for (const name of ['a', 'b']) {
    const filename = `packages/${name}/package.json`
    const manifest = JSON.parse(await readFile(path.join(h.cwd, filename), 'utf8'))
    await h.write(filename, JSON.stringify({ ...manifest, private: true }))
  }
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'private fixture'])
  const commit = h.run('git', ['rev-parse', 'HEAD'])
  const cli = path.resolve(import.meta.dirname, '../../../../bin/repo.js')
  const result = crossSpawn.sync(process.execPath, [cli, 'release', 'nightly', '--dry-run', '--json', '--output', path.join(h.root, 'cli-output')], { cwd: h.cwd, env: { ...h.env, GITHUB_SHA: commit }, encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  const report = JSON.parse(result.stdout)
  expect(report).toMatchObject({ status: 'skipped', provider: 'npm', packages: [], commit })
  expect(report.reason).toContain('No public workspace packages')
  expect(JSON.parse(await readFile(path.join(report.outputDirectory, 'nightly-report.json'), 'utf8'))).toEqual(report)
  expect(h.run('git', ['status', '--porcelain'])).toBe('')
})

it('exposes provider-dependent versioning defaults and validates explicit policies through the built CLI', async () => {
  const h = await fixture()
  const cli = path.resolve(import.meta.dirname, '../../../../bin/repo.js')
  for (const [settings, versioning] of [
    [[], 'date'],
    [['nightly.provider="pkg-pr-new"'], 'snapshot'],
    [['nightly.versioning="snapshot"'], 'snapshot'],
  ] as const) {
    const result = crossSpawn.sync(process.execPath, [cli, 'config', 'inspect', '--command', 'release', '--json', ...settings.flatMap(setting => ['--set', setting])], { cwd: h.cwd, env: h.env, encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).effective.values.nightly.versioning).toBe(versioning)
  }
  const invalid = crossSpawn.sync(process.execPath, [cli, 'config', 'inspect', '--command', 'release', '--json', '--set', 'nightly.provider="pkg-pr-new"', '--set', 'nightly.versioning="date"'], { cwd: h.cwd, env: h.env, encoding: 'utf8' })
  expect(invalid.status).toBe(1)
  expect(JSON.parse(invalid.stdout)).toMatchObject({ valid: false, diagnostics: [expect.objectContaining({ id: 'config.conflict', path: 'commands.release.nightly.versioning' })] })
})
