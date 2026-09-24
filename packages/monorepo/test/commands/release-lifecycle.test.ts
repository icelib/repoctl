import { writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareStable, publishStable, releaseCi } from '@/commands/release'
import { logger } from '@/core/logger'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace, writePendingIntent } from './release-fixtures'

afterEach(async () => {
  vi.restoreAllMocks()
  await cleanupReleaseTempRoots()
})

describe('release lifecycle configuration', () => {
  it('runs configured version lifecycle scripts in order', async () => {
    const cwd = await createTempWorkspace('main')
    await writePendingIntent(cwd)
    const { calls, spawn } = createSpawnMock({ diffStatus: 1 })

    await prepareStable({
      branch: 'main',
      cwd,
      config: {
        qualityScripts: ['quality:release', 'test:packages'],
        hooks: {
          beforeVersion: ['catalog:sync'],
          verify: ['release:verify'],
          afterVersion: ['versions:check'],
        },
      },
      spawn: spawn as never,
    })

    expect(calls).toEqual([
      { command: 'pnpm', args: ['run', 'catalog:sync'] },
      { command: 'pnpm', args: ['run', 'quality:release'] },
      { command: 'pnpm', args: ['run', 'test:packages'] },
      { command: 'pnpm', args: ['run', 'release:verify'] },
      { command: 'pnpm', args: ['version', '-r', '--no-git-checks'] },
      { command: 'pnpm', args: ['run', 'versions:check'] },
      { command: 'git', args: ['diff', '--quiet', '--exit-code'] },
    ])
  })

  it('stops the lifecycle when a configured script fails', async () => {
    const cwd = await createTempWorkspace('main')
    await writePendingIntent(cwd)
    const { calls, spawn } = createSpawnMock({ statuses: { 'pnpm run quality:release': 1 } })

    await expect(prepareStable({
      branch: 'main',
      cwd,
      config: { qualityScripts: ['quality:release'], hooks: { afterVersion: ['versions:check'] } },
      spawn: spawn as never,
    })).rejects.toThrow('command failed: pnpm run quality:release')

    expect(calls).toEqual([{ command: 'pnpm', args: ['run', 'quality:release'] }])
  })

  it('stops before versioning when a verify hook fails', async () => {
    const cwd = await createTempWorkspace('main')
    await writePendingIntent(cwd)
    const { calls, spawn } = createSpawnMock({ statuses: { 'pnpm run release:verify': 1 } })

    await expect(prepareStable({
      branch: 'main',
      cwd,
      config: {
        qualityScripts: ['quality:release'],
        hooks: { verify: ['release:verify'] },
      },
      spawn: spawn as never,
    })).rejects.toThrow('command failed: pnpm run release:verify')

    expect(calls).toEqual([
      { command: 'pnpm', args: ['run', 'quality:release'] },
      { command: 'pnpm', args: ['run', 'release:verify'] },
    ])
  })

  it('fails before quality scripts when an internal peer dependency uses a semver range', async () => {
    const cwd = await createTempWorkspace('main')
    await writeFile(path.join(cwd, 'packages', 'repoctl', 'package.json'), JSON.stringify({
      name: 'repoctl',
      version: '1.0.0',
      peerDependencies: {
        'private-package': '>=1.0.0',
      },
    }), 'utf8')
    await writePendingIntent(cwd)
    const { calls, spawn } = createSpawnMock()

    await expect(prepareStable({
      branch: 'main',
      cwd,
      config: { qualityScripts: ['quality:release'] },
      spawn: spawn as never,
    })).rejects.toThrow('peerDependencies.private-package=>=1.0.0')

    expect(calls).toEqual([])
  })

  it('rejects stable publish while change intents are pending', async () => {
    const cwd = await createTempWorkspace('main')
    await writePendingIntent(cwd)
    const { spawn } = createSpawnMock()

    await expect(
      publishStable({ branch: 'main', cwd, spawn: spawn as never }),
    ).rejects.toThrow('found unconsumed change intents')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('runs every lifecycle phase for prerelease packages', async () => {
    const cwd = await createTempWorkspace('alpha')
    await writePendingIntent(cwd)
    const { calls, hookEnvs, spawn } = createSpawnMock({
      diffStatus: 1,
      publishedPackages: [{ name: 'repoctl', version: '1.1.0-alpha.0' }],
    })
    const ensureRelease = vi.fn()
    const ensureTag = vi.fn()

    await releaseCi({
      branch: 'alpha',
      cwd,
      env: { GITHUB_SHA: 'abc123' },
      github: { ensurePullRequest: vi.fn(), ensureRelease, ensureTag },
      config: {
        qualityScripts: ['quality:release'],
        hooks: {
          beforeVersion: ['catalog:sync'],
          afterVersion: ['versions:check'],
          beforePublish: ['publish:check'],
          afterPublish: [{ script: 'release:sync' }],
        },
      },
      spawn: spawn as never,
    })

    expect(calls.map(call => call.args.at(-1))).toEqual([
      'catalog:sync',
      'quality:release',
      '--no-git-checks',
      'versions:check',
      '--exit-code',
      '-A',
      'chore(release): alpha [skip ci]',
      'publish:check',
      '--no-git-checks',
      'version',
      'HEAD:alpha',
      'release:sync',
    ])
    expect(hookEnvs.at(-1)).toMatchObject({
      REPO_RELEASE_PUBLISHED_PACKAGES: JSON.stringify([{ name: 'repoctl', version: '1.1.0-alpha.0' }]),
      REPO_RELEASE_PUBLISH_SUMMARY: path.resolve(cwd, 'pnpm-publish-summary.json'),
    })
    expect(ensureTag.mock.invocationCallOrder[0]).toBeLessThan(ensureRelease.mock.invocationCallOrder[0]!)
    expect(ensureRelease.mock.invocationCallOrder[0]).toBeLessThan(spawn.mock.invocationCallOrder.at(-1)!)
  })

  it('skips post-publish hooks when no npm packages were published', async () => {
    const cwd = await createTempWorkspace('main')
    const { calls, spawn } = createSpawnMock()

    await releaseCi({
      mode: 'publish',
      branch: 'main',
      cwd,
      config: {
        qualityScripts: ['quality:release'],
        hooks: { beforePublish: ['publish:check'], afterPublish: [{ script: 'release:sync' }] },
      },
      spawn: spawn as never,
    })

    expect(calls).toEqual([
      { command: 'pnpm', args: ['run', 'quality:release'] },
      { command: 'pnpm', args: ['run', 'publish:check'] },
      { command: 'pnpm', args: ['publish', '-r', '--report-summary', '--provenance', '--no-git-checks'] },
    ])
  })

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
