import { createAutoChangesetPlan } from '@icebreakers/monorepo'
import { describe, expect, it } from 'vitest'
import { baseSha, githubFixture, headSha, manifest, workspaceFiles } from './fixture'

describe('public automatic changeset planning', () => {
  it('discovers nested pnpm workspaces and never executes scripts or candidate configuration', async () => {
    const fixture = githubFixture({ head: { ...workspaceFiles(), 'repoctl.config.ts': 'throw new Error("must not execute")' } })
    const report = await createAutoChangesetPlan(fixture.api)
    expect(report.status).toBe('planned')
    expect(report.packages).toEqual([{ name: '@fixture/foo', directory: 'packages-runtime/foo', level: 'patch', reasons: ['path:packages-runtime/foo/src/index.ts'] }])
    expect(report.revision).toMatchObject({ headSha, baseSha })
    expect(report.change?.content).toContain('"@fixture/foo": patch')
    expect(fixture.mutations).toEqual([])
  })

  it('respects pnpm exclusion patterns and private workspaces', async () => {
    const fixture = githubFixture({ files: [
      { filename: 'packages/excluded/src/index.ts', status: 'modified' },
      { filename: 'mpcore/packages/constants/src/index.ts', status: 'modified' },
    ] })
    expect((await createAutoChangesetPlan(fixture.api)).packages).toEqual([])
  })

  it('does not parse excluded or non-workspace fixtures, including symlink manifests', async () => {
    const fixture = githubFixture({ head: {
      ...workspaceFiles(),
      'packages/excluded/package.json': '{ invalid fixture',
      'test/fixtures/broken/package.json': 'this is deliberately malformed',
      'test/fixtures/symlink/package.json': '../broken/package.json',
    } })
    for (const tree of fixture.treeResponses.values()) {
      for (const entry of tree['tree'] as Array<Record<string, unknown>>) {
        if (entry['path'] === 'test/fixtures/symlink/package.json') {
          entry['mode'] = '120000'
        }
      }
    }
    expect((await createAutoChangesetPlan(fixture.api)).packages.map(pkg => pkg.name)).toEqual(['@fixture/foo'])
    const selectedSymlink = githubFixture()
    for (const tree of selectedSymlink.treeResponses.values()) {
      for (const entry of tree['tree'] as Array<Record<string, unknown>>) {
        if (entry['path'] === 'packages-runtime/foo/package.json') {
          entry['mode'] = '120000'
        }
      }
    }
    await expect(createAutoChangesetPlan(selectedSymlink.api)).rejects.toThrow('regular file')
  })

  it.each(['catalog:', 'catalog:default'])('resolves dependency aliases through %s when coupling consumers of private packages', async (catalog) => {
    const files = workspaceFiles()
    files['pnpm-workspace.yaml'] += 'catalog:\n  aliased: "npm:@fixture/constants@^2.0.0"\n'
    const fixture = githubFixture({ head: { ...files, 'packages/consumer/package.json': manifest('@fixture/consumer', { dependencies: { aliased: catalog } }) }, base: files, files: [{ filename: 'mpcore/packages/constants/src/index.ts', status: 'modified' }] })
    const report = await createAutoChangesetPlan({ ...fixture.api, policy: { links: [{ from: ['@fixture/constants'], dependents: true }] } })
    expect(report.packages).toEqual([{ name: '@fixture/consumer', directory: 'packages/consumer', level: 'patch', reasons: ['linked:@fixture/constants'] }])
  })

  it.each(['workspace:@fixture/constants@*', 'npm:@fixture/constants@^2.0.0', 'file:../../mpcore/packages/constants', 'link:../../mpcore/packages/constants'])('links dependency consumers through %s', async (specifier) => {
    const fixture = githubFixture({
      head: { ...workspaceFiles(), 'packages/consumer/package.json': manifest('@fixture/consumer', { dependencies: { aliased: specifier } }) },
      files: [{ filename: 'mpcore/packages/constants/src/index.ts', status: 'modified' }],
    })
    const report = await createAutoChangesetPlan({ ...fixture.api, policy: { links: [{ from: ['@fixture/constants'], dependents: true }] } })
    expect(report.packages.map(pkg => pkg.name)).toEqual(['@fixture/consumer'])
  })

  it('does not link an external file dependency just because its alias matches a workspace name', async () => {
    const fixture = githubFixture({
      head: { ...workspaceFiles(), 'packages/consumer/package.json': manifest('@fixture/consumer', { dependencies: { '@fixture/constants': 'file:../../vendor/constants' } }) },
      files: [{ filename: 'mpcore/packages/constants/src/index.ts', status: 'modified' }],
    })
    const report = await createAutoChangesetPlan({ ...fixture.api, policy: { links: [{ from: ['@fixture/constants'], dependents: true }] } })
    expect(report.packages).toEqual([])
  })

  it('supports explicit coupling, path exclusions, levels, and Chinese summaries', async () => {
    const fixture = githubFixture({ title: 'feat: 新增运行时能力' })
    const report = await createAutoChangesetPlan({ ...fixture.api, policy: {
      links: [{ from: ['@fixture/foo'], to: ['@fixture/main'], level: 'patch' }],
      summary: { language: 'zh-CN', byType: { feat: '新增：{title}（#{number}），涉及 {packages}' } },
    } })
    expect(report.packages.map(pkg => [pkg.name, pkg.level])).toEqual([['@fixture/foo', 'minor'], ['@fixture/main', 'patch']])
    expect(report.change?.content).toContain('新增：feat: 新增运行时能力（#17）')
    const skipped = await createAutoChangesetPlan({ ...fixture.api, policy: { paths: [{ patterns: ['packages-runtime/**'], release: false }] } })
    expect(skipped.change).toBeUndefined()
  })

  it('uses trusted default-branch JSON and ignores a malicious candidate policy', async () => {
    const fixture = githubFixture({
      head: { ...workspaceFiles(), '.github/repoctl-auto-changeset.json': '{"defaultLevel":"major"}' },
      trusted: { '.github/repoctl-auto-changeset.json': '{"summary":{"language":"zh-CN"}}' },
      title: 'chore(deps): upgrade a dependency to v20',
    })
    const report = await createAutoChangesetPlan(fixture.api)
    expect(report.packages[0]?.level).toBe('patch')
    expect(report.change?.content).toContain('变更：chore(deps):')
  })

  it('requires an explicit release label for breaking titles and fails conflicting labels', async () => {
    const fixture = githubFixture({ title: 'feat!: redesign API' })
    await expect(createAutoChangesetPlan(fixture.api)).rejects.toThrow('explicit release level')
    fixture.labels.push('release:minor')
    expect((await createAutoChangesetPlan(fixture.api)).packages[0]?.level).toBe('minor')
    fixture.labels.push('release:major')
    await expect(createAutoChangesetPlan(fixture.api)).rejects.toThrow('Conflicting')
  })

  it.each(['constructor', '__proto__', 'toString'])('does not resolve inherited mapping properties for %s titles or labels', async (key) => {
    const fixture = githubFixture({ title: `${key}: compatible update`, labels: [key] })
    const report = await createAutoChangesetPlan({ ...fixture.api, policy: { titleTypes: {}, labels: {}, summary: { byType: {} } } })
    expect(report.packages[0]?.level).toBe('patch')
    expect(report.change?.content).toContain(`${key}: compatible update (#17)`)
    expect(report.change?.content).not.toContain('function')
  })

  it('honors explicitly declared prototype-like keys as ordinary data', async () => {
    const fixture = githubFixture({ title: 'constructor: compatible update', labels: ['__proto__'] })
    const policy = JSON.parse('{"labels":{"__proto__":"minor"},"titleTypes":{"constructor":"major"},"summary":{"byType":{"constructor":"Custom: {title}"}}}')
    const report = await createAutoChangesetPlan({ ...fixture.api, policy })
    expect(report.packages[0]?.level).toBe('minor')
    expect(report.change?.content).toContain('Custom: constructor: compatible update')
  })

  it.each(['---\n"@fixture/foo": patch\n---\n\nWritten by a maintainer.\n', '---\n---\n\nNo release needed.\n'])('gives handwritten intents priority, including explicit no-release', async (content) => {
    const fixture = githubFixture({ head: { ...workspaceFiles(), '.changeset/manual.md': content }, files: [
      { filename: 'packages-runtime/foo/src/index.ts', status: 'modified' },
      { filename: '.changeset/manual.md', status: 'added' },
    ] })
    const report = await createAutoChangesetPlan(fixture.api)
    expect(report.status).toBe('manual')
    expect(report.change).toBeUndefined()
  })

  it('is idempotent and removes managed intent when original changes are withdrawn', async () => {
    const first = await createAutoChangesetPlan(githubFixture().api)
    const head = { ...workspaceFiles(), '.changeset/auto-pr-17.md': first.change!.content! }
    const unchanged = await createAutoChangesetPlan(githubFixture({ head }).api)
    expect(unchanged.status).toBe('unchanged')
    expect(unchanged.change).toBeUndefined()
    const withdrawn = await createAutoChangesetPlan(githubFixture({ head, files: [{ filename: '.changeset/auto-pr-17.md', status: 'added' }] }).api)
    expect(withdrawn.change).toEqual({ path: '.changeset/auto-pr-17.md', action: 'delete' })
    const noRelease = await createAutoChangesetPlan(githubFixture({ head, labels: ['release:none'] }).api)
    expect(noRelease.status).toBe('no-release')
    expect(noRelease.change?.action).toBe('delete')
  })

  it('never overwrites or deletes an unowned or human-edited managed filename', async () => {
    const first = await createAutoChangesetPlan(githubFixture().api)
    for (const content of ['---\n"@fixture/foo": major\n---\n\nHuman intent.\n', first.change!.content!.replace('compatible update', 'manual edit')]) {
      const fixture = githubFixture({ head: { ...workspaceFiles(), '.changeset/auto-pr-17.md': content }, labels: ['release:none'] })
      const report = await createAutoChangesetPlan(fixture.api)
      expect(report.status).toBe('protected')
      expect(report.change).toBeUndefined()
    }
  })

  it('accounts for both sides of a rename and refuses unexplained removed packages', async () => {
    const moved = githubFixture({ files: [{ filename: 'packages/main/src/moved.ts', previous_filename: 'packages-runtime/foo/src/index.ts', status: 'renamed' }] })
    expect((await createAutoChangesetPlan(moved.api)).packages.map(pkg => pkg.name)).toEqual(['@fixture/foo', '@fixture/main'])
    const head: Record<string, string> = workspaceFiles()
    delete head['packages-runtime/foo/package.json']
    const removed = githubFixture({ head, files: [{ filename: 'packages-runtime/foo/package.json', status: 'removed' }] })
    await expect(createAutoChangesetPlan(removed.api)).rejects.toThrow('Removed public packages')
    removed.labels.push('release:none')
    expect((await createAutoChangesetPlan(removed.api)).status).toBe('no-release')
  })

  it('refuses partial pagination, truncated trees, and missing package metadata', async () => {
    const partial = githubFixture()
    partial.pull['changed_files'] = 2
    await expect(createAutoChangesetPlan(partial.api)).rejects.toThrow('pagination is incomplete')
    const truncated = githubFixture()
    for (const tree of truncated.treeResponses.values()) {
      tree['truncated'] = true
    }
    await expect(createAutoChangesetPlan(truncated.api)).rejects.toThrow('truncated')
    const missing = githubFixture({ head: { 'package.json': manifest('root', { private: true }) } })
    await expect(createAutoChangesetPlan(missing.api)).rejects.toThrow('pnpm-workspace.yaml')
    const malformed = githubFixture({ head: { ...workspaceFiles(), 'packages-runtime/foo/package.json': '{' } })
    await expect(createAutoChangesetPlan(malformed.api)).rejects.toThrow()
    const damaged = githubFixture()
    for (const blob of damaged.blobResponses.values()) {
      blob['size'] = 0
    }
    await expect(createAutoChangesetPlan(damaged.api)).rejects.toThrow('integrity mismatch')
  })

  it.each(['../../**', 'C:/outside/*', 'C:outside/*', '\\\\host\\share\\*', '!!../../**', '!!/outside/*', 'packages/\0*', '!C:/outside/*'])('rejects unsafe workspace glob %j before discovery', async (pattern) => {
    const fixture = githubFixture({ head: { ...workspaceFiles(), 'pnpm-workspace.yaml': `packages: ${JSON.stringify([pattern])}\n` } })
    await expect(createAutoChangesetPlan(fixture.api)).rejects.toThrow('isolated metadata directory')
  })

  it('fully paginates changed files and labels', async () => {
    const fixture = githubFixture({ files: Array.from({ length: 101 }, (_, index) => ({ filename: `packages-runtime/foo/src/${index}.ts`, status: 'modified' })), labels: [...Array.from({ length: 100 }, (_, index) => `other-${index}`), 'release:minor'] })
    expect((await createAutoChangesetPlan(fixture.api)).packages[0]?.level).toBe('minor')
    expect(fixture.requests).toContain('/pulls/17/files?per_page=100&page=2')
    expect(fixture.requests).toContain('/issues/17/labels?per_page=100&page=2')
  })

  it('rejects stale heads and bases and never proposes writes for forks', async () => {
    const fixture = githubFixture()
    await expect(createAutoChangesetPlan({ ...fixture.api, expectedHeadSha: baseSha })).rejects.toThrow('stale')
    await expect(createAutoChangesetPlan({ ...fixture.api, expectedBaseSha: headSha })).rejects.toThrow('stale')
    const fork = githubFixture({ fork: true })
    expect((await createAutoChangesetPlan(fork.api)).status).toBe('fork')
    expect(fork.mutations).toEqual([])
    expect(fork.requests.some(value => value.startsWith('/pulls/17/files'))).toBe(false)
  })
})
