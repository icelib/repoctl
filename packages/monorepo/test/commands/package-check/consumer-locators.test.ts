import type { PackedPackage } from '../../../src/commands/package-check/types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { satisfies } from 'semver'
import { expect, it } from 'vitest'
// eslint-disable-next-line antfu/no-import-dist -- Verify snapshot consumers of the shipped release workflow.
import { releaseNightly } from '../../../dist/index.mjs'
import { checkDependencyRanges } from '../../../src/commands/package-check/consumer/dependencies'
import { consumerOptionalPeers } from '../../../src/commands/package-check/consumer/optional-peers'
import { consumerRuntimeClosure } from '../../../src/commands/package-check/consumer/runtime-closure'
import { fixture } from '../release/nightly/fixture'

function packed(name: string, dependencies?: Record<string, string>): PackedPackage {
  return {
    bytes: new Uint8Array(),
    manifest: { name, version: '1.0.1-snapshot.nightly.test', ...(dependencies ? { dependencies } : {}) },
    result: { name, directory: `/fixture/${name}`, role: 'selected', status: 'passed', files: [], diagnostics: [], commands: [] },
  }
}

it('requires the exact planned workspace URL before local tarball overrides can mask a different locator', () => {
  const url = `https://pkg.pr.new/acme/repo/dependency@${'a'.repeat(40)}`
  const expected = new Map([['consumer', new Map([['dependencies.alias', { name: 'dependency', locator: url }]])]])
  const dependency = packed('dependency')
  const correct = packed('consumer', { alias: url })
  checkDependencyRanges(correct, [correct, dependency], [correct.result, dependency.result], expected)
  expect(correct.result.diagnostics).toEqual([])

  const incorrect = packed('consumer', { alias: url.replace('acme/repo', 'someone/else') })
  checkDependencyRanges(incorrect, [incorrect, dependency], [incorrect.result, dependency.result], expected)
  expect(incorrect.result.diagnostics).toContainEqual(expect.objectContaining({ code: 'WORKSPACE_DEPENDENCY_RANGE' }))

  const unplanned = packed('consumer', { dependency: url })
  checkDependencyRanges(unplanned, [unplanned, dependency], [unplanned.result, dependency.result])
  expect(unplanned.result.diagnostics).toContainEqual(expect.objectContaining({ code: 'WORKSPACE_DEPENDENCY_RANGE' }))

  const missing = packed('consumer', { alias: url })
  checkDependencyRanges(missing, [missing], [missing.result], expected)
  expect(missing.result.diagnostics).toContainEqual(expect.objectContaining({ code: 'WORKSPACE_DEPENDENCY_UNAVAILABLE' }))
})

it('uses planned locator identities to discover optional integrations behind aliased workspace URLs', () => {
  const url = `https://pkg.pr.new/acme/repo/dependency@${'a'.repeat(40)}`
  const expected = new Map([['consumer', new Map([['dependencies.alias', { name: 'dependency', locator: url }]])]])
  const dependency = { ...packed('dependency').manifest, peerDependencies: { semver: '^7' }, peerDependenciesMeta: { semver: { optional: true } } }
  const root = packed('consumer', { alias: url }).manifest
  expect(consumerOptionalPeers(consumerRuntimeClosure([root], [root, dependency]))).toEqual({})
  expect(satisfies('7.8.5', consumerOptionalPeers(consumerRuntimeClosure([root], [root, dependency], expected))['semver']!)).toBe(true)
})

it('consumes pkg.pr.new alias tarballs with optional integrations across the runtime closure', async () => {
  const h = await fixture()
  const a = JSON.parse(await readFile(path.join(h.cwd, 'packages/a/package.json'), 'utf8'))
  const b = JSON.parse(await readFile(path.join(h.cwd, 'packages/b/package.json'), 'utf8'))
  await h.write('packages/a/package.json', JSON.stringify({ ...a, peerDependencies: { semver: '^7.8.5' }, peerDependenciesMeta: { semver: { optional: true } } }))
  await h.write('packages/b/package.json', JSON.stringify({ ...b, dependencies: { adapter: 'workspace:snapshot-a@*' } }))
  await h.write('packages/a/index.js', 'import semver from "semver"; export const value = semver.valid("1.2.3")')
  await h.write('packages/b/index.js', 'import { value } from "adapter"; if (value !== "1.2.3") throw new Error("aliased optional integration not exercised"); export { value }')
  h.run('pnpm', ['install', '--lockfile-only', '--ignore-scripts', '--no-frozen-lockfile', '--registry=https://registry.npmjs.org/'])
  h.run('git', ['add', '.'])
  h.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'optional alias fixture'])
  const report = await releaseNightly({
    ...h.options,
    env: { ...h.env, GITHUB_SHA: h.run('git', ['rev-parse', 'HEAD']), npm_config_registry: 'https://registry.npmjs.org/' },
    config: { ...h.options.config, nightly: { ...h.options.config!.nightly, provider: 'pkg-pr-new' } },
  })
  expect(report.status, report.error).toBe('prepared')
  const checked = report.snapshot!.checks!.find(pkg => pkg.name === 'snapshot-b')!
  expect(checked.status, JSON.stringify(checked, null, 2)).toBe('passed')
  const consumer = checked.commands.find(command => command.args.includes('install'))!.cwd
  const manifest = JSON.parse(await readFile(path.join(consumer, 'package.json'), 'utf8'))
  expect(satisfies('7.8.5', manifest.dependencies.semver)).toBe(true)
  expect(checked.commands.some(command => command.args.includes('--eval') && command.exitCode === 0)).toBe(true)
}, 120_000)
