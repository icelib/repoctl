import { beforeAll, describe, expect, it } from 'vitest'
import { loadRepo } from './fixtures'

let repo: Awaited<ReturnType<typeof loadRepo>>
beforeAll(async () => {
  repo = await loadRepo()
}, 30_000)

describe('remote sources in runtime configuration validation', () => {
  it('accepts both source types, offline/cache options and existing doctor configuration', () => {
    expect(repo.validateMonorepoConfig({ commands: {
      create: { offline: true, cacheDir: './cache', templateMap: {
        npm: { source: '.', target: 'packages/npm', remote: { kind: 'npm', packageName: '@team/templates', version: '1.2.3' } },
        git: { source: 'templates/library', target: 'packages/git', remote: { kind: 'git', repository: 'https://example.test/templates.git', ref: 'v1.2.3' } },
      } },
      doctor: { rules: ['root-scripts'], suppressions: [{ id: 'commit-hooks', reason: 'Validated in CI' }] },
    } })).toEqual([])
  })

  it('rejects cross-kind fields, missing fields and invalid values without serializing credentials', () => {
    const invalid = [
      { kind: 'npm', packageName: '@team/templates', version: 'latest' },
      { kind: 'npm', packageName: '@team/templates', version: '1.2.3', ref: 'main' },
      { kind: 'git', repository: 'https://example.test/templates.git' },
      { kind: 'git', repository: 'https://example.test/templates.git', ref: 'refs/heads/*' },
      { kind: 'git', repository: 'https://user:private-secret@example.test/templates.git', ref: 'main' },
      { kind: 'npm', packageName: '@team/templates', version: '1.2.3', registry: 'https://user:private-secret@example.test/' },
    ]
    for (const remote of invalid) {
      const diagnostics = repo.validateMonorepoConfig({ commands: { create: { templateMap: { team: { source: '.', target: 'packages/team', remote } } } } })
      expect(diagnostics.length).toBeGreaterThan(0)
      expect(diagnostics.every(item => item.path.startsWith('commands.create.templateMap.team.remote'))).toBe(true)
      expect(JSON.stringify(diagnostics)).not.toContain('private-secret')
    }
  })
})
