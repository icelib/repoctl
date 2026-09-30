import type { ReleaseNoteDocument } from '@/commands/release'
import { writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { releaseCi } from '@/commands/release'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace, writePendingIntent } from '../release-fixtures'

afterEach(async () => {
  vi.restoreAllMocks()
  await cleanupReleaseTempRoots()
})

describe('release behavior', () => {
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
    const { calls, spawn } = createSpawnMock({ diffStatus: 1, versionedPackages: [{ name: 'repoctl', version: '1.0.1' }] })
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

    expect(calls).toContainEqual({ command: 'pnpm', args: ['version', '-r', '--no-git-checks', '--json'] })
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
    const { calls, spawn } = createSpawnMock({ diffStatus: 1, versionedPackages: [{ name: 'repoctl', version: '1.0.1' }] })
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
      { command: 'pnpm', args: ['version', '-r', '--no-git-checks', '--json'] },
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
})
