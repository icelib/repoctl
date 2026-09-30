import { writeFile } from 'node:fs/promises'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enterPrerelease, exitPrerelease, parsePublishSummary, releaseCi, releasePrerelease } from '@/commands/release'
import { logger } from '@/core/logger'
import { cleanupReleaseTempRoots, createSpawnMock, createTempWorkspace, writePendingIntent } from '../release-fixtures'

afterEach(async () => {
  vi.restoreAllMocks()
  await cleanupReleaseTempRoots()
})

describe('release behavior', () => {
  it('skips prerelease publish when version creates no changes', async () => {
    const cwd = await createTempWorkspace('next')
    await writePendingIntent(cwd)
    const { calls, spawn } = createSpawnMock({ diffStatus: 0 })

    await releasePrerelease({ branch: 'next', cwd, spawn: spawn as never })

    expect(calls).toEqual([
      { command: 'pnpm', args: ['run', 'build'] },
      { command: 'pnpm', args: ['run', 'lint'] },
      { command: 'pnpm', args: ['run', 'test'] },
      { command: 'pnpm', args: ['version', '-r', '--no-git-checks', '--json'] },
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
    const { calls, spawn } = createSpawnMock({ diffStatus: 1, versionedPackages: [{ name: 'repoctl', version: '1.0.1' }] })

    await releasePrerelease({ branch: 'alpha', cwd, spawn: spawn as never })

    expect(calls).toEqual([
      { command: 'pnpm', args: ['run', 'build'] },
      { command: 'pnpm', args: ['run', 'lint'] },
      { command: 'pnpm', args: ['run', 'test'] },
      { command: 'pnpm', args: ['version', '-r', '--no-git-checks', '--json'] },
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
