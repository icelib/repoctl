import { writeFile } from 'node:fs/promises'
import { publishStable, releaseCi } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupReleaseTempRoots, writePendingIntent } from '../release-fixtures'
import { a, b, publishHarness } from './publish-fixtures'

afterEach(cleanupReleaseTempRoots)

describe('built public release lifecycle with visibility confirmation', () => {
  it('keeps no-op releases empty and ignores old reports', async () => {
    const h = await publishHarness([{ status: 0, summary: [] }])
    await writeFile(path.join(h.cwd, 'repoctl-publish-progress.json'), JSON.stringify({ acceptedPackages: [a, b] }))
    await writeFile(path.join(h.cwd, 'pnpm-publish-summary.json'), JSON.stringify({ publishedPackages: [a, b] }))
    await expect(publishStable(h.options)).resolves.toEqual([])
    expect(h.calls.some(call => call.command === 'npm')).toBe(false)
    expect(await h.report()).toMatchObject({ status: 'complete', acceptedPackages: [], confirmedPackages: [] })
  })

  it('runs release metadata and post-publish hooks once, after all versions are visible', async () => {
    const h = await publishHarness([
      { status: 1, summary: [a], stderr: 'HTTP 503' },
      { status: 0, summary: [b] },
    ], (_spec, { attempts, elapsed }) => attempts === 2 && elapsed >= 30_000 ? '1.0.0' : '')
    const github = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn(), ensureTag: vi.fn() }

    await expect(releaseCi({ ...h.options, mode: 'publish', github })).resolves.toEqual([a, b])
    expect(github.ensureTag).toHaveBeenCalledTimes(2)
    expect(github.ensureRelease).toHaveBeenCalledTimes(2)
    expect(h.calls.filter(call => call.command === 'pnpm' && call.args[0] === 'run').map(call => call.args[1])).toEqual(['quality', 'before', 'after'])
    expect(h.calls.at(-1)?.options?.env).toMatchObject({ REPO_RELEASE_PUBLISHED_PACKAGES: JSON.stringify([a, b]) })
    expect(h.calls.some(call => ['version', 'commit'].includes(call.args[0]!))).toBe(false)
    expect(github.ensureRelease.mock.invocationCallOrder.at(-1)).toBeLessThan(h.spawn.mock.invocationCallOrder.at(-1)!)
  })

  it('does not run metadata or post-publish hooks after confirmation times out', async () => {
    const h = await publishHarness([{ status: 0, summary: [a, b] }], () => '')
    const github = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn(), ensureTag: vi.fn() }
    await expect(releaseCi({ ...h.options, mode: 'publish', github })).rejects.toThrow('visibility confirmation timed out')
    expect(github.ensureRelease).not.toHaveBeenCalled()
    expect(github.ensureTag).not.toHaveBeenCalled()
    expect(h.calls.some(call => call.args[1] === 'after')).toBe(false)
  })

  it('confirms skipped packages in single-package recovery without a redundant query', async () => {
    const h = await publishHarness([{ status: 0, summary: [] }], (_spec, { queries }) => queries === 1 ? '1.0.0' : '')
    const github = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn(), ensureTag: vi.fn() }
    await expect(releaseCi({ ...h.options, mode: 'publish-unpublished', packageName: a.name, packageVersion: a.version, github })).resolves.toEqual([a])
    expect(h.calls.filter(call => call.command === 'npm')).toHaveLength(1)
    expect(h.uploads()[0]?.args).toContain('--provenance')
    expect(github.ensureRelease).toHaveBeenCalledOnce()
  })

  it.each([true, false])('pushes prereleases only after visibility confirmation (visible: %s)', async (visible) => {
    const h = await publishHarness([{ status: 0, summary: [a, b] }], (_spec, { elapsed }) => visible && elapsed >= 10_000 ? '1.0.0' : '')
    await writePendingIntent(h.cwd)
    await writeFile(path.join(h.cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\nversioning:\n  lanes:\n    repoctl: alpha\n    "@scope/b": alpha\n')
    const github = { ensurePullRequest: vi.fn(), ensureRelease: vi.fn(), ensureTag: vi.fn() }
    const promise = releaseCi({ ...h.options, branch: 'alpha', github })
    if (visible) {
      await expect(promise).resolves.toEqual([a, b])
    }
    else {
      await expect(promise).rejects.toThrow('visibility confirmation timed out')
    }
    expect(h.uploads()[0]?.args).toEqual(['publish', '-r', '--tag', 'alpha', '--report-summary', '--provenance', '--no-git-checks'])
    expect(h.calls.filter(call => call.args[0] === 'version')).toHaveLength(1)
    expect(h.calls.filter(call => call.command === 'git' && call.args[0] === 'commit')).toHaveLength(1)
    expect(h.calls.filter(call => call.command === 'git' && call.args[0] === 'push')).toHaveLength(visible ? 1 : 0)
    expect(github.ensureRelease).toHaveBeenCalledTimes(visible ? 2 : 0)
  })
})
