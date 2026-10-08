import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { clearWorkspaceCache, releaseCi } from '@icebreakers/monorepo'
import { afterEach, expect, it } from 'vitest'
import { versionOnlyFixture } from './fixture'

afterEach(clearWorkspaceCache)

it.each(['en', 'zh-CN'] as const)('保留 %s 发布 PR 中真实 fixed 升版的全部平台包及独立说明边界', async (locale) => {
  const h = await versionOnlyFixture(locale)
  await releaseCi(h.options)

  expect(h.applied.map(pkg => pkg.name).sort()).toEqual(['a', ...h.nativeNames].sort())
  expect(h.applied.every(pkg => pkg.currentVersion === '1.0.0' && pkg.newVersion === '1.1.0')).toBe(true)
  expect(h.github.ensurePullRequest).toHaveBeenCalledOnce()
  const { body } = h.github.ensurePullRequest.mock.calls[0]![0]
  expect(body).toContain(locale === 'zh-CN' ? '9 个包更新' : '9 packages updated')
  expect(body).toContain('| `a` | [`1.0.0`]')
  expect(body).toContain('**a@1.1.0**: 新增可选 Rust 内核。')
  const document = h.github.enrichReleaseNote.mock.calls[0]![0]
  expect(document.packages.map(pkg => pkg.name).sort()).toEqual(h.applied.map(pkg => pkg.name).sort())
  const compilerEntry = document.entries.find(entry => entry.packageName === 'a')!
  expect(compilerEntry.commits.map(commit => commit.sha)).toContain(h.source)
  for (const name of h.nativeNames) {
    const suffix = name.replace('@fixture/native-', '')
    const manifest = JSON.parse(await readFile(path.join(h.cwd, 'packages-native', suffix, 'package.json'), 'utf8'))
    expect(manifest.version).toBe('1.1.0')
    const changelog = await readFile(path.join(h.cwd, 'packages-native', suffix, 'CHANGELOG.md'), 'utf8')
    expect(changelog.trim()).toBe(`# ${name}\n\n## 1.1.0`)
    expect(body).toContain(`| \`${name}\` | [\`1.0.0\`](https://www.npmjs.com/package/${name}/v/1.0.0) | \`1.1.0\` |`)
    const entries = document.entries.filter(entry => entry.packageName === name)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      category: 'maintenance',
      summary: locale === 'zh-CN' ? '仅更新版本；未记录该包的独立变更说明。' : 'Version-only release; no package-specific changelog entries.',
      commits: [],
      authors: [],
    })
    expect(body).not.toContain(`**${name}@1.1.0**: 新增可选 Rust 内核。`)
  }
  expect(body).not.toContain('consumer')
  expect(body).not.toContain('private-lib')
  expect(h.pushes).toEqual([['push', '--force', 'origin', 'HEAD:release/pnpm-version']])
  expect(h.github.ensureRelease).not.toHaveBeenCalled()
  await expect(readFile(path.join(h.cwd, '.changeset', 'test.md'))).rejects.toMatchObject({ code: 'ENOENT' })
}, 60_000)
