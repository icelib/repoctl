import type { ReleaseNoteDocument, ReleaseNoteEntry } from '@/commands/release'
import { describe, expect, it } from 'vitest'
import { renderGitHubRelease, renderReleasePullRequest } from '@/commands/release'

function entry(overrides: Partial<ReleaseNoteEntry> = {}): ReleaseNoteEntry {
  return {
    packageName: 'weapp-vite',
    version: '1.2.3',
    category: 'fixes',
    summary: 'fix: 修复发布说明中的重复展示。',
    details: 'fix: 修复发布说明中的重复展示。\n\n保留完整的多段说明。',
    commits: [],
    pullRequests: [],
    issues: [],
    authors: [],
    ...overrides,
  }
}

function document(entries: ReleaseNoteEntry[], packages: ReleaseNoteDocument['packages'] = []): ReleaseNoteDocument {
  return { entries, packages, contributors: [], compareUrls: [] }
}

describe('compact release notes', () => {
  it('groups repeated cross-package summaries and keeps every package version and changelog link', () => {
    const packages = Array.from({ length: 320 }, (_, index) => ({
      name: `@weapp-vite/package-${index}`,
      version: '1.2.3',
      previousVersion: '1.2.2',
      changelogPath: `packages/package-${index}`,
    }))
    const entries = packages.map((pkg, index) => entry({
      packageName: pkg.name,
      version: pkg.version,
      commits: [{ sha: `${String(index).padStart(7, '0')}abcdef`, subject: 'fix: shared release change', packages: [pkg.name] }],
      pullRequests: [1374],
    }))
    const body = renderReleasePullRequest(document(entries, packages), {
      compact: true,
      locale: 'zh-CN',
      repository: 'weapp-vite/weapp-vite',
    })

    expect(body.length).toBeLessThan(65536)
    expect(body.match(/^- .*修复发布说明中的重复展示。/gm)).toHaveLength(1)
    expect(body).toContain('影响 320 个包')
    expect(body).toContain('[#1374](https://github.com/weapp-vite/weapp-vite/pull/1374)')
    expect(body).toContain('`@weapp-vite/package-0`')
    expect(body).toContain('`@weapp-vite/package-319`')
    expect(body).toContain('1.2.2')
    expect(body).toContain('1.2.3')
    expect(body).toContain('[CHANGELOG](packages/package-0/CHANGELOG.md)')
  })

  it('keeps category and source-reference boundaries when grouping equal summaries', () => {
    const sameSummary = 'fix: 同步一项公共修复。'
    const entries = [
      entry({ packageName: 'a', summary: sameSummary, pullRequests: [10] }),
      entry({ packageName: 'b', summary: sameSummary, pullRequests: [10] }),
      entry({ packageName: 'c', summary: sameSummary, pullRequests: [11] }),
      entry({ packageName: 'd', summary: sameSummary, category: 'features', pullRequests: [10] }),
      entry({ packageName: 'e', summary: 'fix: 独立修复。', pullRequests: [10] }),
    ]
    const body = renderReleasePullRequest(document(entries), { compact: true, locale: 'zh-CN' })

    expect(body.match(/同步一项公共修复。/g)).toHaveLength(3)
    expect(body.match(/新功能[\s\S]*同步一项公共修复。/)).not.toBeNull()
    expect(body).toContain('影响 2 个包')
    expect(body).toContain('影响 1 个包')
    expect(body).toContain('独立修复。')
  })

  it('shows the first Chinese sentence and folds the exact full GitHub Release text with links and emoji', () => {
    const details = 'fix: 修复中文调用边界。\n\n第二段保留 **完整格式**、[参考链接](https://example.test/docs) 和 🚀。'
    const release = renderGitHubRelease(document([
      entry({
        summary: details,
        details,
        commits: [{ sha: 'abcdef0123456789', subject: 'fix: preserve complete release text' }],
        pullRequests: [1374],
        issues: [81],
      }),
    ]), { compact: true, locale: 'zh-CN', repository: 'weapp-vite/weapp-vite' })

    expect(release).toContain('<summary>fix: 修复中文调用边界。</summary>')
    expect(release).toContain(details)
    expect(release).toContain('[#1374](https://github.com/weapp-vite/weapp-vite/pull/1374)')
    expect(release).toContain('[#81](https://github.com/weapp-vite/weapp-vite/issues/81)')
    expect(release).toContain('[`abcdef0`](https://github.com/weapp-vite/weapp-vite/commit/abcdef0123456789)')
    expect(release.match(/<details>/g)).toHaveLength(1)
    expect(release.match(/<\/details>/g)).toHaveLength(1)
  })

  it('preserves the existing full rendering when compact mode is omitted', () => {
    const body = renderReleasePullRequest(document([
      entry({ packageName: 'weapp-vite', summary: 'fix: keep the complete entry visible.' }),
    ]), { locale: 'en' })

    expect(body).toContain('- **weapp-vite@1.2.3**: fix: keep the complete entry visible.')
    expect(body).not.toContain('Complete notes')
    expect(body).not.toContain('<details>')
  })

  it('keeps compact maintenance notes inside one collapsed section', () => {
    const body = renderReleasePullRequest(document([
      entry({ category: 'maintenance', summary: 'chore: 更新依赖锁文件。', details: 'chore: 更新依赖锁文件。\n\n保留依赖升级明细。' }),
    ]), { compact: true, locale: 'zh-CN' })

    expect(body).toContain('保留依赖升级明细。')
    expect(body.match(/<details>/g)).toHaveLength(1)
    expect(body.match(/<\/details>/g)).toHaveLength(1)
    expect(body).not.toContain('<summary>完整说明</summary>')
  })
})
