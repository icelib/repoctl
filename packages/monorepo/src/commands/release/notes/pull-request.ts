import type { ReleaseOptions } from '../types'
import type { ReleaseBodyMetadata, ReleaseNoteDocument, ReleaseNoteEntry } from './model'
import path from 'pathe'
import { getWorkspacePackages } from '../../../core/workspace'
import { ReleaseCommandError } from '../errors'
import { capture } from '../shared'
import { categoryOrder } from './model'
import { formatCategoryEntries, formatContributors, formatVersion, localized, renderReleasePullRequest } from './render'

const releasePullRequestBodyLimit = 65536

/** 超长说明只省略完整条目，始终保留全部包版本和不可变 changelog 链接。 */
function renderSummary(document: ReleaseNoteDocument, metadata: ReleaseBodyMetadata, packages: string[], entries: ReleaseNoteEntry[]) {
  const sections = [
    `# ${localized(metadata, 'Release Notes (Summary)', '发布说明（摘要）')}`,
    '',
    localized(metadata, 'The complete release notes exceed GitHub\'s pull request body limit. Full notes remain in each package\'s CHANGELOG linked below.', '完整发布说明超过 GitHub PR 正文限制。各包的完整变更保留在下方链接的 CHANGELOG 中。'),
    '',
    ...packages,
    '',
    localized(metadata, `Showing ${entries.length} of ${document.entries.length} changes. Read the complete CHANGELOG links above for all changes.`, `已展示 ${entries.length} / ${document.entries.length} 项变更；全部变更请查看上方各包的完整 CHANGELOG。`),
  ]
  for (const category of categoryOrder) {
    const section = formatCategoryEntries(entries, category, metadata, 2, false)
    if (section.length) {
      sections.push('', ...section)
    }
  }
  sections.push('', ...formatContributors(document.contributors, metadata))
  return sections.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 普通正文保持原样；推送前校验摘要预算，避免留下无法创建 PR 的版本分支。 */
export async function renderBoundedReleasePullRequest(document: ReleaseNoteDocument, metadata: ReleaseBodyMetadata, options: ReleaseOptions) {
  const fullBody = renderReleasePullRequest(document, metadata)
  if (fullBody.length <= releasePullRequestBodyLimit) {
    return fullBody
  }
  if (!metadata.repository || !/^[^/]+\/[^/]+$/.test(metadata.repository)) {
    throw new ReleaseCommandError('Oversized release PR notes require GITHUB_REPOSITORY for complete changelog links; no PR pushed')
  }
  const commit = capture('git', ['rev-parse', 'HEAD'], options)
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(commit)) {
    throw new ReleaseCommandError('Cannot resolve the version commit for complete release changelog links; no PR pushed')
  }
  const workspace = await getWorkspacePackages(options.cwd, { ignorePrivatePackage: false, ignoreRootPackage: false })
  const roots = new Map(workspace.map(pkg => [pkg.manifest.name, pkg.rootDir]))
  const baseUrl = `${(metadata.serverUrl || 'https://github.com').replace(/\/$/, '')}/${metadata.repository}/blob/${commit}`
  const packages = [
    `## ${localized(metadata, 'Packages', '包')}`,
    '',
    `| ${localized(metadata, 'Package', '包')} | ${localized(metadata, 'From', '原版本')} | ${localized(metadata, 'To', '新版本')} | ${localized(metadata, 'Complete notes', '完整变更')} |`,
    '| --- | --- | --- | --- |',
    ...document.packages.map((pkg) => {
      const root = roots.get(pkg.name)
      if (!root) {
        throw new ReleaseCommandError(`Cannot resolve complete changelog for ${pkg.name}; no PR pushed`)
      }
      const relative = path.relative(path.resolve(options.cwd), path.resolve(root))
      if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
        throw new ReleaseCommandError(`Release changelog for ${pkg.name} must stay inside the repository; no PR pushed`)
      }
      const changelog = [...relative ? relative.split('/') : [], 'CHANGELOG.md'].map(encodeURIComponent).join('/')
      const previous = pkg.previousVersion ? formatVersion(pkg.previousVersion, pkg.previousNpmUrl) : '—'
      return `| \`${pkg.name}\` | ${previous} | ${formatVersion(pkg.version)} | [${localized(metadata, 'Complete notes', '完整变更')}](${baseUrl}/${changelog}) |`
    }),
  ]
  const selected: ReleaseNoteEntry[] = []
  let body = renderSummary(document, metadata, packages, selected)
  if (body.length > releasePullRequestBodyLimit) {
    throw new ReleaseCommandError('Complete package/version/changelog summary exceeds GitHub\'s 65536-character PR body limit; no PR pushed')
  }
  for (const category of categoryOrder) {
    for (const entry of document.entries.filter(entry => entry.category === category)) {
      const candidate = renderSummary(document, metadata, packages, [...selected, entry])
      if (candidate.length <= releasePullRequestBodyLimit) {
        selected.push(entry)
        body = candidate
      }
    }
  }
  return body
}
