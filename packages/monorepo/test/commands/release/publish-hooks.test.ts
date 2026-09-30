import { afterEach, describe, expect, it, vi } from 'vitest'
import { releaseCi } from '@/commands/release'
import { logger } from '@/core/logger'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace } from '../release-fixtures'

afterEach(async () => {
  vi.restoreAllMocks()
  await cleanupReleaseTempRoots()
})

describe('release behavior', () => {
  it('reuses publish hooks during unpublished-version recovery', async () => {
    const cwd = await createTempWorkspace('main')
    const { calls, spawn } = createSpawnMock({
      publishedPackages: [{ name: 'repoctl', version: '1.0.0' }],
      stdout: {
        'pnpm --filter repoctl exec node -p require(\'./package.json\').version': '1.0.0',
        'npm view repoctl@1.0.0 version': '1.0.0',
      },
    })
    const github = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn(), ensureTag: vi.fn() }

    await releaseCi({
      mode: 'publish-unpublished',
      branch: 'main',
      cwd,
      github,
      config: {
        qualityScripts: ['quality:release'],
        hooks: { beforePublish: ['publish:check'], afterPublish: [{ script: 'release:sync' }] },
      },
      packageName: 'repoctl',
      packageVersion: '1.0.0',
      spawn: spawn as never,
    })

    expect(github.ensureRelease).toHaveBeenCalledOnce()
    expect(calls.slice(1, 3)).toEqual([
      { command: 'pnpm', args: ['run', 'quality:release'] },
      { command: 'pnpm', args: ['run', 'publish:check'] },
    ])
    expect(calls.at(-1)).toEqual({ command: 'pnpm', args: ['run', 'release:sync'] })
  })

  it('propagates post-publish hook failures', async () => {
    const cwd = await createTempWorkspace('main')
    const { spawn } = createSpawnMock({
      publishedPackages: [{ name: 'repoctl', version: '1.0.0' }],
      statuses: { 'pnpm run release:sync': 1 },
    })

    await expect(releaseCi({
      mode: 'publish',
      branch: 'main',
      cwd,
      env: { GITHUB_SHA: 'abc123' },
      github: { ensurePullRequest: vi.fn(), ensureRelease: vi.fn(), ensureTag: vi.fn() },
      config: { hooks: { afterPublish: [{ script: 'release:sync' }] } },
      spawn: spawn as never,
    })).rejects.toThrow('command failed: pnpm run release:sync')
  })

  it('warns and preserves the release when an optional post-publish hook fails', async () => {
    const cwd = await createTempWorkspace('main')
    const { spawn } = createSpawnMock({
      publishedPackages: [{ name: 'repoctl', version: '1.0.0' }],
      statuses: { 'pnpm run release:sync': 1 },
    })
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)

    await expect(releaseCi({
      mode: 'publish',
      branch: 'main',
      cwd,
      env: { GITHUB_SHA: 'abc123' },
      github: { ensurePullRequest: vi.fn(), ensureRelease: vi.fn(), ensureTag: vi.fn() },
      config: { hooks: { afterPublish: [{ script: 'release:sync', continueOnError: true }] } },
      spawn: spawn as never,
    })).resolves.toEqual([{ name: 'repoctl', version: '1.0.0' }])
    expect(warn).toHaveBeenCalledWith('release afterPublish hook failed and was ignored: release:sync')
  })
})
