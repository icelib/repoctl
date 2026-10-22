import type { NightlyOptions } from '@icebreakers/monorepo'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { runUncachedQualityScripts } from '../../../../src/commands/release/hooks'
import { nightlyCommand } from '../../../../src/commands/release/nightly/process'
import { reportFixture } from './provider-fixture'

const controls = {
  REPO_RELEASE_MODE: 'nightly',
  REPO_RELEASE_PACKAGE: 'repoctl',
  REPO_RELEASE_VERSION: '1.0.0',
  REPO_RELEASE_DRY_RUN: 'false',
  REPO_RELEASE_RECOVERY_SOURCE_SHA: 'a'.repeat(40),
  REPO_RELEASE_SOURCE_SHA: 'b'.repeat(40),
  REPO_RELEASE_ACKNOWLEDGE_HOOKS: 'after',
  REPOCTL_NIGHTLY_PROVIDER: 'npm',
  REPOCTL_NIGHTLY_SCHEDULE: '17 19 * * *',
  REPOCTL_SNAPSHOT_PUBLISH: '1',
}

const inherited = {
  COREPACK_HOME: '/user-selected/corepack-cache',
  npm_config_registry: 'https://registry.example.invalid/',
  npm_config_manage_package_manager_versions: 'false',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  REPOCTL_NIGHTLY_CUSTOM: 'user-defined-value',
}

afterEach(() => vi.unstubAllEnvs())

it.each([
  ['explicit', undefined],
  ['explicit', '1'],
  ['explicit', '0'],
  ['ambient', undefined],
  ['ambient', '1'],
  ['ambient', '0'],
] as const)('isolates nightly quality subprocesses with %s environment and Corepack network policy %s', async (environment, network) => {
  const values = { ...controls, ...inherited, COREPACK_ENABLE_NETWORK: network }
  const input: NodeJS.ProcessEnv = { ...process.env, ...values }
  if (network === undefined) {
    delete input['COREPACK_ENABLE_NETWORK']
  }
  if (environment === 'ambient') {
    for (const [name, value] of Object.entries(values)) {
      vi.stubEnv(name, value)
    }
  }
  const parentEnv = environment === 'explicit' ? input : process.env
  const before = { ...parentEnv }
  const script = `
    import assert from 'node:assert/strict';
    for (const name of ${JSON.stringify(Object.keys(controls))}) {
      assert.equal(process.env[name], undefined, name + ' leaked into quality subprocess');
    }
    for (const [name, value] of Object.entries(${JSON.stringify(inherited)})) {
      assert.equal(process.env[name], value, name + ' was not preserved');
    }
    assert.equal(process.env.COREPACK_ENABLE_NETWORK, ${JSON.stringify(network) ?? 'undefined'});
    console.log(process.argv[1]);
  `
  const options: NightlyOptions = {
    cwd: import.meta.dirname,
    ...(environment === 'explicit' ? { env: input } : {}),
    config: { qualityScripts: ['quality:nightly'], hooks: { verify: ['verify:nightly'] } },
  }
  const report = reportFixture()
  const scripts: string[] = []
  await runUncachedQualityScripts(options, (command, args, settings) => {
    expect(command).toBe('pnpm')
    expect(args[0]).toBe('run')
    scripts.push(args[1]!)
    expect(nightlyCommand(report, settings, process.execPath, ['--input-type=module', '--eval', script, args[1]!])).toBe(args[1])
  })
  expect(scripts).toEqual(['quality:nightly', 'verify:nightly'])
  expect(report.commands.map(command => command.exitCode)).toEqual([0, 0])
  expect(report.commands.map(command => command.stdout?.trim())).toEqual(scripts)
  expect(parentEnv).toEqual(before)
})
