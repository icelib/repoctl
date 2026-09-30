import { writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareStable, publishStable, releaseCi, releasePrerelease } from '@/commands/release'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace, writePendingIntent } from '../release-fixtures'

afterEach(async () => {
  vi.restoreAllMocks()
  await cleanupReleaseTempRoots()
})

describe('release behavior', () => {
  it('localizes the release pull request when REPOCTL_LANG is zh-CN', async () => {
    const cwd = await createTempWorkspace('main')
    await writePendingIntent(cwd)
    const { spawn } = createSpawnMock({ diffStatus: 1, versionedPackages: [{ name: 'repoctl', version: '1.0.1' }] })
    const github = {
      ensurePullRequest: vi.fn(),
      closeLegacyReleasePullRequests: vi.fn(),
      ensureRelease: vi.fn(),
    }

    await releaseCi({
      mode: 'auto',
      branch: 'main',
      cwd,
      env: { REPOCTL_LANG: 'zh-CN' },
      github,
      spawn: spawn as never,
    })

    expect(github.ensurePullRequest).toHaveBeenCalledWith(expect.objectContaining({
      title: 'chore(release): 更新包版本',
      body: expect.stringContaining('# 发布说明'),
    }))
  })

  it('prepares a stable release from pending pnpm intents', async () => {
    const cwd = await createTempWorkspace('main')
    await writePendingIntent(cwd)
    const { calls, spawn } = createSpawnMock({ diffStatus: 1, versionedPackages: [{ name: 'repoctl', version: '1.0.1' }] })

    await expect(prepareStable({ branch: 'main', cwd, spawn: spawn as never })).resolves.toBe(true)

    expect(calls).toEqual([
      { command: 'pnpm', args: ['run', 'build'] },
      { command: 'pnpm', args: ['run', 'lint'] },
      { command: 'pnpm', args: ['run', 'test'] },
      { command: 'pnpm', args: ['version', '-r', '--no-git-checks', '--json'] },
      { command: 'git', args: ['diff', '--quiet', '--exit-code'] },
    ])
  })

  it('does not version when there are no pending intents', async () => {
    const cwd = await createTempWorkspace('main')
    const { calls, spawn } = createSpawnMock()

    await expect(prepareStable({ branch: 'main', cwd, spawn: spawn as never })).resolves.toBe(false)
    expect(calls).toEqual([])
  })

  it('publishes packages versioned by the merged release pull request', async () => {
    const cwd = await createTempWorkspace('main')
    const { calls, spawn } = createSpawnMock()

    await publishStable({ branch: 'main', cwd, spawn: spawn as never })

    expect(calls).toEqual([
      { command: 'pnpm', args: ['run', 'build'] },
      { command: 'pnpm', args: ['run', 'lint'] },
      { command: 'pnpm', args: ['run', 'test'] },
      { command: 'pnpm', args: ['publish', '-r', '--report-summary', '--provenance', '--no-git-checks'] },
    ])
  })

  it('clears stale publish summaries before reading the current publish result', async () => {
    const cwd = await createTempWorkspace('main')
    await writeFile(path.join(cwd, 'pnpm-publish-summary.json'), JSON.stringify({
      publishedPackages: [{ name: 'stale-package', version: '9.9.9' }],
    }), 'utf8')
    const { spawn } = createSpawnMock()

    await expect(publishStable({ branch: 'main', cwd, spawn: spawn as never })).resolves.toEqual([])
  })

  it('rejects stable releases away from main', async () => {
    const cwd = await createTempWorkspace('main')
    const { spawn } = createSpawnMock()

    await expect(
      publishStable({ branch: 'next', cwd, spawn: spawn as never }),
    ).rejects.toThrow('repo release stable publish is only allowed on main')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('requires every package to be on the matching pnpm lane', async () => {
    const cwd = await createTempWorkspace('beta')
    const { spawn } = createSpawnMock()

    await expect(
      releasePrerelease({ branch: 'alpha', cwd, spawn: spawn as never }),
    ).rejects.toThrow('all publishable packages must be on the alpha lane')
    expect(spawn).not.toHaveBeenCalled()
  })
})
