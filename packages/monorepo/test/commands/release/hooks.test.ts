import { writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareStable, publishStable, releaseCi } from '@/commands/release'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace, writePendingIntent } from '../release-fixtures'

afterEach(async () => {
  vi.restoreAllMocks()
  await cleanupReleaseTempRoots()
})

describe('release behavior', () => {
  it('runs configured version lifecycle scripts in order', async () => {
    const cwd = await createTempWorkspace('main')
    await writePendingIntent(cwd)
    const { calls, spawn } = createSpawnMock({ diffStatus: 1, versionedPackages: [{ name: 'repoctl', version: '1.0.1' }] })

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
      { command: 'pnpm', args: ['version', '-r', '--workspace-packages', 'packages/repoctl', '--no-git-checks', '--json'] },
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
      '--json',
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

  it('retains empty-summary behavior for legacy programmatic adapters', async () => {
    const cwd = await createTempWorkspace('main')
    const { calls, spawn } = createSpawnMock()

    await releaseCi({
      github: { ensurePullRequest: vi.fn(), ensureRelease: vi.fn() },
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
})
