import type { ReleaseNoteDocument } from '@/commands/release'
import { writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enterPrerelease, exitPrerelease, parsePublishSummary, prepareStable, publishStable, releaseCi, releasePrerelease } from '@/commands/release'
import { logger } from '@/core/logger'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace, writePendingIntent } from './release-fixtures'

afterEach(async () => {
  vi.restoreAllMocks()
  await cleanupReleaseTempRoots()
})

describe('release commands', () => {
  it('skips an ordinary GitHub push before quality scripts', async () => {
    const cwd = await createTempWorkspace('main')
    const { calls, spawn } = createSpawnMock()

    await releaseCi({
      branch: 'main',
      cwd,
      env: { GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'main' },
      spawn: spawn as never,
    })

    expect(calls).toEqual([
      { command: 'git', args: ['diff', '--name-only', 'HEAD^', 'HEAD'] },
      { command: 'git', args: ['log', '-1', '--format=%s', 'HEAD'] },
    ])
  })

  it('prepares a GitHub push with a pending intent', async () => {
    const cwd = await createTempWorkspace('main')
    await writePendingIntent(cwd)
    const { calls, spawn } = createSpawnMock({ diffStatus: 1 })
    const github = {
      ensurePullRequest: vi.fn(),
      closeLegacyReleasePullRequests: vi.fn(),
      ensureRelease: vi.fn(),
      ensureTag: vi.fn(),
    }

    await releaseCi({
      branch: 'main',
      cwd,
      env: { GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'main' },
      github,
      spawn: spawn as never,
    })

    expect(calls).toContainEqual({ command: 'pnpm', args: ['version', '-r', '--no-git-checks'] })
    expect(github.ensurePullRequest).toHaveBeenCalledOnce()
  })

  it('publishes a GitHub release commit without pending intents', async () => {
    const cwd = await createTempWorkspace('main')
    const { calls, spawn } = createSpawnMock({ stdout: {
      'git log -1 --format=%s HEAD': 'chore(release): version packages',
    } })

    await releaseCi({ github: { ensurePullRequest: vi.fn(), ensureRelease: vi.fn() }, branch: 'main', cwd, env: { GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'main' }, spawn: spawn as never })

    expect(calls).toContainEqual({ command: 'pnpm', args: ['publish', '-r', '--report-summary', '--provenance', '--no-git-checks'] })
  })

  it('publishes release PR contributors into GitHub Release metadata', async () => {
    const cwd = await createTempWorkspace('main')
    await writeFile(path.join(cwd, 'packages', 'repoctl', 'CHANGELOG.md'), '# repoctl\n\n## 1.0.0\n\n### Patch Changes\n\n- 修复发布说明。\n', 'utf8')
    const { spawn } = createSpawnMock({ publishedPackages: [{ name: 'repoctl', version: '1.0.0' }] })
    const github = {
      ensurePullRequest: vi.fn(),
      ensureRelease: vi.fn(),
      ensureTag: vi.fn(),
      readReleasePullRequestContributors: vi.fn(async () => ['@alice', '**@alice**', '@bob']),
    }

    await releaseCi({ mode: 'publish', branch: 'main', cwd, github, spawn: spawn as never })

    expect(github.readReleasePullRequestContributors).toHaveBeenCalledOnce()
    expect(github.ensureRelease).toHaveBeenCalledWith(expect.objectContaining({
      tag: 'repoctl@1.0.0',
      body: expect.stringContaining('Thanks to @alice · @bob'),
    }))
  })

  it('lets workflow dispatch bypass the automatic trigger probe', async () => {
    const cwd = await createTempWorkspace('main')
    const { calls, spawn } = createSpawnMock()

    await releaseCi({ github: { ensurePullRequest: vi.fn(), ensureRelease: vi.fn() }, branch: 'main', cwd, env: { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF_NAME: 'main' }, spawn: spawn as never })

    expect(calls[0]).toEqual({ command: 'pnpm', args: ['run', 'build'] })
  })

  it('auto mode publishes stable packages when main has no pending intents', async () => {
    const cwd = await createTempWorkspace('main')
    const { calls, spawn } = createSpawnMock()

    await releaseCi({ github: { ensurePullRequest: vi.fn(), ensureRelease: vi.fn() }, mode: 'auto', branch: 'main', cwd, spawn: spawn as never })

    expect(calls).toEqual([
      { command: 'pnpm', args: ['run', 'build'] },
      { command: 'pnpm', args: ['run', 'lint'] },
      { command: 'pnpm', args: ['run', 'test'] },
      { command: 'pnpm', args: ['publish', '-r', '--report-summary', '--provenance', '--no-git-checks'] },
    ])
  })

  it('auto mode versions and opens the release PR when intents are pending', async () => {
    const cwd = await createTempWorkspace('main')
    await writePendingIntent(cwd)
    const { calls, spawn } = createSpawnMock({ diffStatus: 1 })
    const github = {
      ensurePullRequest: vi.fn(async () => ({ number: 1, html_url: 'https://github.com/acme/repo/pull/1', state: 'open' })),
      closeLegacyReleasePullRequests: vi.fn(async () => {}),
      ensureRelease: vi.fn(),
      enrichReleaseNote: vi.fn(async (document: ReleaseNoteDocument) => ({ ...document, contributors: ['alice'] })),
    }

    await releaseCi({ mode: 'auto', branch: 'main', cwd, spawn: spawn as never, github })

    expect(calls).toEqual([
      { command: 'git', args: ['log', '-1', '--format=%H', '--', '.changeset/pending-change.md'] },
      { command: 'pnpm', args: ['run', 'build'] },
      { command: 'pnpm', args: ['run', 'lint'] },
      { command: 'pnpm', args: ['run', 'test'] },
      { command: 'pnpm', args: ['version', '-r', '--no-git-checks'] },
      { command: 'git', args: ['diff', '--quiet', '--exit-code'] },
      { command: 'git', args: ['config', 'user.name', 'github-actions[bot]'] },
      { command: 'git', args: ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'] },
      { command: 'git', args: ['checkout', '-B', 'release/pnpm-version'] },
      { command: 'git', args: ['add', '-A'] },
      { command: 'git', args: ['commit', '-m', 'chore(release): version packages'] },
      { command: 'git', args: ['push', '--force', 'origin', 'HEAD:release/pnpm-version'] },
    ])
    expect(github.ensurePullRequest).toHaveBeenCalledWith(expect.objectContaining({
      head: 'release/pnpm-version',
      base: 'main',
      body: expect.stringContaining('Thanks to @alice'),
    }))
    expect(github.enrichReleaseNote).toHaveBeenCalledOnce()
    expect(github.closeLegacyReleasePullRequests).toHaveBeenCalledWith({ head: 'changeset-release/main', base: 'main' })
  })

  it('localizes the release pull request when REPOCTL_LANG is zh-CN', async () => {
    const cwd = await createTempWorkspace('main')
    await writePendingIntent(cwd)
    const { spawn } = createSpawnMock({ diffStatus: 1 })
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
    const { calls, spawn } = createSpawnMock({ diffStatus: 1 })

    await expect(prepareStable({ branch: 'main', cwd, spawn: spawn as never })).resolves.toBe(true)

    expect(calls).toEqual([
      { command: 'pnpm', args: ['run', 'build'] },
      { command: 'pnpm', args: ['run', 'lint'] },
      { command: 'pnpm', args: ['run', 'test'] },
      { command: 'pnpm', args: ['version', '-r', '--no-git-checks'] },
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

  it('skips prerelease publish when version creates no changes', async () => {
    const cwd = await createTempWorkspace('next')
    await writePendingIntent(cwd)
    const { calls, spawn } = createSpawnMock({ diffStatus: 0 })

    await releasePrerelease({ branch: 'next', cwd, spawn: spawn as never })

    expect(calls).toEqual([
      { command: 'pnpm', args: ['run', 'build'] },
      { command: 'pnpm', args: ['run', 'lint'] },
      { command: 'pnpm', args: ['run', 'test'] },
      { command: 'pnpm', args: ['version', '-r', '--no-git-checks'] },
      { command: 'git', args: ['diff', '--quiet', '--exit-code'] },
    ])
  })

  it('skips prerelease version when there are no pending intents', async () => {
    const cwd = await createTempWorkspace('next')
    const { calls, spawn } = createSpawnMock()

    await releasePrerelease({ branch: 'next', cwd, spawn: spawn as never })

    expect(calls).toEqual([])
  })

  it('commits, publishes, and pushes prerelease version changes', async () => {
    const cwd = await createTempWorkspace('alpha')
    await writePendingIntent(cwd)
    const { calls, spawn } = createSpawnMock({ diffStatus: 1 })

    await releasePrerelease({ branch: 'alpha', cwd, spawn: spawn as never })

    expect(calls).toEqual([
      { command: 'pnpm', args: ['run', 'build'] },
      { command: 'pnpm', args: ['run', 'lint'] },
      { command: 'pnpm', args: ['run', 'test'] },
      { command: 'pnpm', args: ['version', '-r', '--no-git-checks'] },
      { command: 'git', args: ['diff', '--quiet', '--exit-code'] },
      { command: 'git', args: ['add', '-A'] },
      { command: 'git', args: ['commit', '-m', 'chore(release): alpha [skip ci]'] },
      { command: 'pnpm', args: ['publish', '-r', '--tag', 'alpha', '--report-summary', '--provenance', '--no-git-checks'] },
      { command: 'git', args: ['push', '--follow-tags', 'origin', 'HEAD:alpha'] },
    ])
  })

  it('moves all publishable packages between pnpm lanes', async () => {
    const cwd = await createTempWorkspace('main')
    const { calls, spawn } = createSpawnMock()

    await enterPrerelease('rc', { cwd, spawn: spawn as never })
    await exitPrerelease({ cwd, spawn: spawn as never })

    expect(calls).toEqual([
      { command: 'pnpm', args: ['lane', 'rc', '--filter', 'repoctl'] },
      { command: 'pnpm', args: ['lane', 'main', '--filter', 'repoctl'] },
    ])
  })

  it('publishes the normalized package release body', async () => {
    const cwd = await createTempWorkspace('main')
    await writeFile(path.join(cwd, 'packages', 'repoctl', 'CHANGELOG.md'), [
      '# repoctl',
      '',
      '## 1.0.0',
      '',
      '### Patch Changes',
      '',
      '- 修复发布说明。',
      '',
      '## 0.9.0',
      '',
      '- Previous release.',
    ].join('\n'), 'utf8')
    const { spawn } = createSpawnMock({
      publishedPackages: [{ name: 'repoctl', version: '1.0.0' }],
    })
    const github = {
      ensurePullRequest: vi.fn(),
      ensureTag: vi.fn(),
      ensureRelease: vi.fn(),
    }
    const success = vi.spyOn(logger, 'success').mockImplementation(() => undefined)

    await releaseCi({
      mode: 'publish',
      branch: 'main',
      cwd,
      spawn: spawn as never,
      github: github as never,
      env: { GITHUB_SHA: 'abc123', GITHUB_REPOSITORY: 'acme/repo' },
    })

    expect(github.ensureRelease).toHaveBeenCalledWith(expect.objectContaining({
      tag: 'repoctl@1.0.0',
      name: 'repoctl@1.0.0',
      body: expect.stringContaining('### 🐞 Bug Fixes'),
    }))
    expect(success).toHaveBeenCalledWith('Published packages:\n  - repoctl@1.0.0')
  })

  it('parses pnpm publish summaries for release metadata', () => {
    expect(parsePublishSummary(JSON.stringify({
      publishedPackages: [{ name: 'repoctl', version: '1.2.3' }],
    }))).toEqual([{ name: 'repoctl', version: '1.2.3' }])
    expect(() => parsePublishSummary('{"publishedPackages":[{}]}')).toThrow('invalid package entry')
  })
})
