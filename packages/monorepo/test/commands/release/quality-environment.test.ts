import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { prepareStable, publishStable } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace, writePendingIntent } from '../release-fixtures'

const controls = {
  REPO_RELEASE_MODE: 'publish-unpublished',
  REPO_RELEASE_PACKAGE: 'repoctl',
  REPO_RELEASE_VERSION: '1.0.0',
  REPO_RELEASE_DRY_RUN: 'true',
  REPO_RELEASE_RECOVERY_SOURCE_SHA: '1'.repeat(40),
  REPO_RELEASE_SOURCE_SHA: '1'.repeat(40),
  REPO_RELEASE_ACKNOWLEDGE_HOOKS: 'after',
}

const inherited = {
  GITHUB_REPOSITORY: 'acme/repo',
  GITHUB_SHA: '2'.repeat(40),
  GITHUB_REF_NAME: 'main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_TOKEN: 'test-github-token',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-oidc-token',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.invalid/idtoken',
  NODE_AUTH_TOKEN: 'test-npm-token',
  NPM_CONFIG_PROVENANCE: 'true',
  npm_config_registry: 'https://registry.example.invalid',
  REPO_RELEASE_CUSTOM_ENV: 'user-defined-value',
}

function selectedEnvironment(env: NodeJS.ProcessEnv = {}) {
  return Object.fromEntries(Object.keys({ ...controls, ...inherited }).map(name => [name, env[name]]))
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await cleanupReleaseTempRoots()
})

it.each([
  ['explicit', 'prepare'],
  ['ambient', 'prepare'],
  ['explicit', 'publish'],
  ['ambient', 'publish'],
] as const)('isolates %s release controls from %s quality subprocesses while preserving lifecycle context', async (environment, operation) => {
  const cwd = await createTempWorkspace('main')
  const nestedCwd = await createTempWorkspace('main')
  if (operation === 'prepare') {
    await writePendingIntent(cwd)
  }
  const input = { ...process.env, ...controls, ...inherited }
  if (environment === 'ambient') {
    for (const [name, value] of Object.entries({ ...controls, ...inherited })) {
      vi.stubEnv(name, value)
    }
  }
  const parentEnv = environment === 'explicit' ? input : process.env
  const before = selectedEnvironment(parentEnv)
  const entry = pathToFileURL(path.resolve(import.meta.dirname, '../../../dist/index.mjs')).href
  const script = `
    import assert from 'node:assert/strict';
    import { releaseCi } from ${JSON.stringify(entry)};
    for (const name of ${JSON.stringify(Object.keys(controls))}) {
      assert.equal(process.env[name], undefined, name + ' leaked into quality subprocess');
    }
    for (const [name, value] of Object.entries(${JSON.stringify(inherited)})) {
      assert.equal(process.env[name], value, name + ' was not preserved');
    }
    const unexpected = () => { throw new Error('Nested prepare must not execute release operations'); };
    await releaseCi({
      cwd: ${JSON.stringify(nestedCwd)},
      mode: 'prepare',
      branch: 'main',
      config: { qualityScripts: [] },
      spawn: unexpected,
      github: { ensurePullRequest: unexpected, ensureRelease: unexpected },
    });
    console.log('Nested prepare completed');
  `
  const h = createSpawnMock()
  const original = h.spawn.getMockImplementation()!
  const qualityScripts: string[] = []
  const hookScripts: string[] = []
  h.spawn.mockImplementation((command, args, options) => {
    if (command === 'pnpm' && args[0] === 'run') {
      const name = args[1]!
      if (['quality:release', 'release:verify'].includes(name)) {
        qualityScripts.push(name)
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
          cwd,
          env: options?.env,
          encoding: 'utf8',
          timeout: 20_000,
        })
        expect(result.stderr).toBe('')
        expect(result.status).toBe(0)
        expect(result.stdout).toContain('Nested prepare completed')
        return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr }
      }
      hookScripts.push(name)
      expect(selectedEnvironment(options?.env)).toEqual({ ...controls, ...inherited })
    }
    return original(command, args, options)
  })
  const options = {
    cwd,
    branch: 'main',
    ...(environment === 'explicit' ? { env: input } : {}),
    spawn: h.spawn as never,
    config: {
      qualityScripts: ['quality:release'],
      hooks: {
        verify: ['release:verify'],
        beforeVersion: ['before:version'],
        afterVersion: ['after:version'],
        beforePublish: ['before:publish'],
      },
    },
  }
  if (operation === 'prepare') {
    await expect(prepareStable(options)).resolves.toBe(false)
    expect(hookScripts).toEqual(['before:version', 'after:version'])
  }
  else {
    await expect(publishStable(options)).resolves.toEqual([])
    expect(hookScripts).toEqual(['before:publish'])
    const publish = h.spawn.mock.calls.find(([command, args]) => command === 'pnpm' && args[0] === 'publish')
    expect(selectedEnvironment(publish?.[2]?.env)).toEqual({ ...controls, ...inherited })
  }
  expect(qualityScripts).toEqual(['quality:release', 'release:verify'])
  expect(selectedEnvironment(parentEnv)).toEqual(before)
})
