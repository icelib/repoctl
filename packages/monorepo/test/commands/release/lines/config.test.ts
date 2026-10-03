import type { ReleaseBranchesConfig } from '@icebreakers/monorepo'
import { resolveReleaseBranches } from '@icebreakers/monorepo'
import crossSpawn from 'cross-spawn'
import { describe, expect, it } from 'vitest'
import { releasePullRequestHead } from '@/commands/release/lines'
import { shouldRunRelease } from '@/commands/release/trigger'
import { branches, lineFixture } from './fixture'

describe('built release branch mapping', () => {
  it('retains the default branches, lanes and npm tags', () => {
    expect(resolveReleaseBranches().map(({ branch, lane, distTag }) => [branch, lane, distTag])).toEqual([
      ['main', 'main', 'latest'],
      ['alpha', 'alpha', 'alpha'],
      ['beta', 'beta', 'beta'],
      ['rc', 'rc', 'rc'],
      ['next', 'next', 'next'],
    ])
    expect(resolveReleaseBranches({ prerelease: [] })).toHaveLength(1)
  })

  it('shares the maintenance range with its prerelease target and reserves it from latest', () => {
    const rules = resolveReleaseBranches(branches)
    expect(rules[0]).toMatchObject({ branch: 'master', kind: 'stable', excludedRanges: ['1.x'], distTag: 'latest' })
    expect(rules[1]).toMatchObject({ branch: '1.x', kind: 'maintenance', lane: 'main', range: '1.x', distTag: 'legacy-1' })
    expect(rules[2]).toMatchObject({ branch: 'preview/1.x', kind: 'prerelease', lane: 'beta', range: '1.x', target: '1.x' })
    expect(shouldRunRelease({ rules, branch: '1.x', eventName: 'push', pendingChangesetFiles: [], changedFiles: [], commitMessage: 'chore(release): version packages' })).toBe(true)
    expect(shouldRunRelease({ rules, branch: 'main', eventName: 'push', pendingChangesetFiles: ['.changeset/change.md'], changedFiles: [] })).toBe(false)
  })

  it.each([
    { stable: '../main' },
    { stable: 'HEAD' },
    { stable: 'support', maintenance: [{ branch: 'support/1.x', range: '1.x', tag: 'legacy' }] },
    { stable: 'alpha' },
    { stable: 'release/pnpm-version' },
    { maintenance: [{ branch: '1.x', range: '>=1', tag: 'legacy' }] },
    { maintenance: [{ branch: '1.x', range: '1.x', tag: 'latest' }] },
    { maintenance: [{ branch: '1.x', range: '1.x', tag: '1.x' }] },
    { maintenance: [{ branch: '1.x', range: '1.x', tag: 'snapshot-nightly' }] },
    { maintenance: [{ branch: '1.x', range: '1.x', tag: 'old' }, { branch: 'other', range: '>=1.5 <3', tag: 'older' }] },
    { prerelease: [{ branch: 'preview', lane: 'main', tag: 'preview' }] },
    { prerelease: [{ branch: 'preview', lane: 'beta', tag: 'preview', target: 'missing' }] },
    { prerelease: [{ branch: 'preview', lane: 'beta', tag: 'preview' }, { branch: 'test', lane: 'beta', tag: 'test' }] },
  ] as ReleaseBranchesConfig[])('rejects ambiguous or unsafe mappings before a command can run: %j', (config) => {
    expect(() => resolveReleaseBranches(config)).toThrow('Invalid release branch configuration')
  })

  it('creates simultaneous stable and maintenance PR refs without Git directory collisions', async () => {
    const h = await lineFixture()
    const rules = resolveReleaseBranches({ ...branches, maintenance: [...branches.maintenance!, { branch: 'support/2.x', range: '2.x', tag: 'legacy-2' }] })
    for (const rule of rules.filter(rule => rule.kind !== 'prerelease')) {
      const head = releasePullRequestHead(rule)
      const result = crossSpawn.sync('git', ['branch', head], { cwd: h.cwd, encoding: 'utf8' })
      expect(result.status, result.stderr).toBe(0)
    }
  })
})
