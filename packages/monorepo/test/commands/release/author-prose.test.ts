import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { repairReleaseNotes } from '@icebreakers/monorepo'
import path from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildGitHubReleaseBodyFromChangelog } from '@/commands/release'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

function changelogFor(...entries: string[]) {
  return ['# @acme/demo', '', '## 1.0.0', '', '### Patch Changes', '', ...entries.map(entry => `- ${entry}`)].join('\n')
}

describe('release author prose', () => {
  it.each([
    'Keep stylelint disabled by default.',
    'Expose a loader used by the bridge.',
    'Fix parser by bob.',
    'Fix parser by ice breaker.',
  ])('preserves ordinary prose: %s', (summary) => {
    const body = buildGitHubReleaseBodyFromChangelog('@acme/demo', '1.0.0', changelogFor(summary))

    expect(body).toContain(`**: ${summary}`)
    expect(body).not.toContain('Contributors')
    expect(body).not.toContain('Thanks to')
  })

  it('preserves explicit changelog usernames alongside ordinary prose', () => {
    const body = buildGitHubReleaseBodyFromChangelog('@acme/demo', '1.0.0', changelogFor(
      'Keep stylelint disabled by default. by @sonofmagic',
      'Expose a loader used by the bridge. by @daguanren21',
      'Update dependencies. by @github-actions[bot]',
    ))

    expect(body).toContain('**: Keep stylelint disabled by default.')
    expect(body).toContain('**: Expose a loader used by the bridge.')
    expect(body).toContain('Thanks to @daguanren21 · @sonofmagic')
    expect(body).not.toContain('@default')
    expect(body).not.toContain('@the')
    expect(body).not.toContain('@github-actions')
  })

  it('repairs historical notes with the built package without inventing contributors', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'repo-release-author-prose-'))
    tempRoots.push(cwd)
    const packageDir = path.join(cwd, 'packages', 'demo')
    await mkdir(packageDir, { recursive: true })
    await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name: '@acme/demo', version: '1.0.0' }))
    const summaries = [
      'Keep stylelint disabled by default.',
      'Expose a loader used by the bridge.',
      'Fix parser by bob.',
      'Fix parser by ice breaker.',
    ]
    const changelog = changelogFor(...summaries, 'Fix author attribution. by @daguanren21')
    const updateRelease = vi.fn()

    await repairReleaseNotes({
      cwd,
      tag: '@acme/demo@1.0.0',
      spawn: vi.fn(() => ({ status: 0, stdout: changelog })) as never,
      github: {
        listReleases: vi.fn().mockResolvedValue([{ id: 1, tag_name: '@acme/demo@1.0.0' }]),
        updateRelease,
      },
    })

    expect(updateRelease).toHaveBeenCalledOnce()
    const body = updateRelease.mock.calls[0]?.[0].body as string
    for (const summary of summaries) {
      expect(body).toContain(`**: ${summary}`)
    }
    expect(body).toContain('Thanks to @daguanren21')
    expect(body).not.toMatch(/@(default|the|bob|ice)\b/)
  })
})
