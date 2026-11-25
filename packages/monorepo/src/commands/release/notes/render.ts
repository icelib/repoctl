import type { ReleaseBodyMetadata, ReleaseCategory, ReleaseNoteDocument, ReleaseNoteEntry, ReleaseNoteGroup } from './model'
import { resolveRepoctlLocale } from '../../../i18n'
import { groupReleaseNoteEntries } from './groups'
import { categoryOrder, categoryTitles, uniqueContributors, zhCNCategoryTitles } from './model'

function isChinese(metadata: ReleaseBodyMetadata) {
  return (metadata.locale ?? resolveRepoctlLocale()) === 'zh-CN'
}

export function localized(metadata: ReleaseBodyMetadata, english: string, simplifiedChinese: string) {
  return isChinese(metadata) ? simplifiedChinese : english
}

function formatReferenceLinks(entry: Pick<ReleaseNoteEntry, 'commits' | 'pullRequests' | 'issues'>, metadata: ReleaseBodyMetadata) {
  const repository = metadata.repository && /^[^/]+\/[^/]+$/.test(metadata.repository) ? metadata.repository : undefined
  const serverUrl = (metadata.serverUrl || 'https://github.com').replace(/\/$/, '')
  const baseUrl = repository ? `${serverUrl}/${repository}` : undefined
  const links: string[] = []
  for (const commit of entry.commits) {
    const label = commit.sha.slice(0, 7)
    links.push(baseUrl ? `[\`${label}\`](${baseUrl}/commit/${commit.sha})` : `\`${label}\``)
  }
  for (const number of entry.pullRequests) {
    links.push(baseUrl ? `[#${number}](${baseUrl}/pull/${number})` : `#${number}`)
  }
  for (const number of entry.issues) {
    links.push(baseUrl ? `[#${number}](${baseUrl}/issues/${number})` : `#${number}`)
  }
  return links.length ? ` ${links.join(' · ')}` : ''
}

function firstSentence(summary: string) {
  const punctuation = /[。！？]|[.!?](?=\s|$)/u.exec(summary)
  const newline = summary.search(/\r?\n/)
  const end = punctuation?.index !== undefined && (newline < 0 || punctuation.index < newline)
    ? punctuation.index + punctuation[0].length
    : newline >= 0
      ? newline
      : summary.length
  return summary.slice(0, end).trim()
}

function formatCompactPackageCount(count: number, metadata: ReleaseBodyMetadata) {
  return isChinese(metadata) ? `影响 ${count} 个包` : `${count} package${count === 1 ? '' : 's'} affected`
}

function formatCompactGroupLine(group: ReleaseNoteGroup, metadata: ReleaseBodyMetadata, showPackageCount: boolean) {
  const summary = firstSentence(group.summary)
  const affected = showPackageCount ? ` (${formatCompactPackageCount(group.packageNames.length, metadata)})` : ''
  return `- ${summary}${affected}${formatReferenceLinks(group, metadata)}`
}

export function formatCompactCategoryEntries(
  groups: ReleaseNoteGroup[],
  category: ReleaseCategory,
  metadata: ReleaseBodyMetadata,
  headingLevel: 2 | 3,
  showPackageCount: boolean,
  detailsMode: boolean | 'inline' = false,
) {
  const matching = groups.filter(group => group.category === category)
  if (!matching.length) {
    return []
  }
  return [
    `${'#'.repeat(headingLevel)} ${isChinese(metadata) ? zhCNCategoryTitles[category] : categoryTitles[category]}`,
    '',
    ...matching.flatMap((group) => {
      const line = formatCompactGroupLine(group, metadata, showPackageCount)
      if (!detailsMode) {
        return [line]
      }
      const details = [...new Set(group.entries.map(entry => entry.details ?? entry.summary))]
      if (detailsMode === 'inline') {
        return [line, '', ...details]
      }
      return [line, '', '<details>', `<summary>${localized(metadata, 'Full details', '完整说明')}</summary>`, '', ...details, '', '</details>']
    }),
  ]
}

function formatEntry(entry: ReleaseNoteEntry, metadata: ReleaseBodyMetadata, linkNpmVersion: boolean) {
  const packageLabel = linkNpmVersion && entry.npmUrl
    ? `[${entry.packageName}@${entry.version}](${entry.npmUrl})`
    : `${entry.packageName}@${entry.version}`
  return `- **${packageLabel}**: ${entry.summary}${formatReferenceLinks(entry, metadata)}`
}

export function formatCategoryEntries(
  entries: ReleaseNoteEntry[],
  category: ReleaseCategory,
  metadata: ReleaseBodyMetadata,
  headingLevel: 2 | 3,
  linkNpmVersion: boolean,
) {
  const matching = entries.filter(entry => entry.category === category)
  if (!matching.length) {
    return []
  }
  return [
    `${'#'.repeat(headingLevel)} ${isChinese(metadata) ? zhCNCategoryTitles[category] : categoryTitles[category]}`,
    '',
    ...matching.map(entry => formatEntry(entry, metadata, linkNpmVersion)),
  ]
}

function formatContributor(value: string) {
  if (value.startsWith('@')) {
    return value
  }
  return /^[\w-]+$/.test(value) ? `@${value}` : value
}

export function formatContributors(contributors: string[], metadata: ReleaseBodyMetadata) {
  const unique = uniqueContributors(contributors).sort((a, b) => a.localeCompare(b))
  return unique.length
    ? [`## ❤️ ${localized(metadata, 'Contributors', '贡献者')}`, '', `${localized(metadata, 'Thanks to', '感谢')} ${unique.map(formatContributor).join(' · ')}`]
    : []
}

export function formatVersion(version: string, npmUrl?: string) {
  return npmUrl ? `[\`${version}\`](${npmUrl})` : `\`${version}\``
}

function formatPackages(packages: ReleaseNoteDocument['packages'], linkNpmVersion: boolean, metadata: ReleaseBodyMetadata) {
  if (!packages.length) {
    return []
  }
  return [
    `## ${localized(metadata, 'Packages', '包')}`,
    '',
    `| ${localized(metadata, 'Package', '包')} | ${localized(metadata, 'From', '原版本')} | ${localized(metadata, 'To', '新版本')} |`,
    '| --- | --- | --- |',
    ...packages.map((pkg) => {
      const previous = pkg.previousVersion ? formatVersion(pkg.previousVersion, pkg.previousNpmUrl) : '—'
      const current = formatVersion(pkg.version, linkNpmVersion ? pkg.npmUrl : undefined)
      return `| \`${pkg.name}\` | ${previous} | ${current} |`
    }),
  ]
}

function encodeRelativePath(value: string) {
  return value.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function changelogUrl(path: string) {
  const relative = encodeRelativePath(path ? `${path}/CHANGELOG.md` : 'CHANGELOG.md')
  return relative
}

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]!)
}

function formatCompactPackages(packages: ReleaseNoteDocument['packages'], metadata: ReleaseBodyMetadata) {
  if (!packages.length) {
    return []
  }
  return [
    `## ${localized(metadata, 'Packages', '包')}`,
    '',
    `| ${localized(metadata, 'Package', '包')} | ${localized(metadata, 'From', '原版本')} | ${localized(metadata, 'To', '新版本')} | ${localized(metadata, 'Complete notes', '完整变更')} |`,
    '| --- | --- | --- | --- |',
    ...packages.map((pkg) => {
      const previous = pkg.previousVersion ? formatVersion(pkg.previousVersion, pkg.previousNpmUrl) : '—'
      const current = formatVersion(pkg.version)
      const changelog = pkg.changelogPath !== undefined
        ? `[${localized(metadata, 'CHANGELOG', 'CHANGELOG')}](${changelogUrl(pkg.changelogPath)})`
        : '—'
      return `| \`${pkg.name}\` | ${previous} | ${current} | ${changelog} |`
    }),
  ]
}

export function renderReleasePullRequest(document: ReleaseNoteDocument, metadata: ReleaseBodyMetadata = {}) {
  const groups = metadata.compact ? groupReleaseNoteEntries(document.entries) : []
  const packageWord = isChinese(metadata)
    ? `${document.packages.length} 个包更新`
    : `${document.packages.length} package${document.packages.length === 1 ? '' : 's'} updated`
  const changeWord = isChinese(metadata)
    ? `${metadata.compact ? groups.length : document.entries.length} 项变更`
    : `${metadata.compact ? groups.length : document.entries.length} change${(metadata.compact ? groups.length : document.entries.length) === 1 ? '' : 's'}`
  const sections = [`# ${localized(metadata, 'Release Notes', '发布说明')}`, '', `> ${packageWord} · ${changeWord}`]

  for (const category of categoryOrder.filter(category => category !== 'maintenance')) {
    const section = metadata.compact
      ? formatCompactCategoryEntries(groups, category, metadata, 2, true, true)
      : formatCategoryEntries(document.entries, category, metadata, 2, false)
    if (section.length) {
      sections.push('', '', ...section)
    }
  }

  const maintenance = metadata.compact
    ? formatCompactCategoryEntries(groups, 'maintenance', metadata, 2, true, 'inline')
    : formatCategoryEntries(document.entries, 'maintenance', metadata, 2, false)
  if (maintenance.length) {
    sections.push('', '', '<details>', `<summary>${localized(metadata, '🧰 Maintenance', '🧰 维护')}</summary>`, '', ...maintenance.slice(2), '', '</details>')
  }

  sections.push('', '', ...(metadata.compact ? formatCompactPackages(document.packages, metadata) : formatPackages(document.packages, false, metadata)))
  sections.push('', '', ...formatContributors(document.contributors, metadata))
  return sections.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function renderGitHubRelease(document: ReleaseNoteDocument, metadata: ReleaseBodyMetadata = {}) {
  if (!document.entries.length) {
    return localized(metadata, 'No significant changes.', '没有显著变更。')
  }

  const sections: string[] = []
  const groups = metadata.compact ? groupReleaseNoteEntries(document.entries) : []
  for (const category of categoryOrder) {
    const section = metadata.compact
      ? (() => {
          const matching = groups.filter(group => group.category === category)
          if (!matching.length) {
            return []
          }
          return [
            `### ${isChinese(metadata) ? zhCNCategoryTitles[category] : categoryTitles[category]}`,
            '',
            ...matching.flatMap((group) => {
              const visible = firstSentence(group.summary)
              const affected = group.packageNames.length > 1 ? ` · ${formatCompactPackageCount(group.packageNames.length, metadata)}` : ''
              const fullDetails = [...new Set(group.entries.map(entry => entry.details ?? entry.summary))].join('\n\n')
              const references = formatReferenceLinks(group, metadata).trim()
              return [
                '<details>',
                `<summary>${escapeHtml(visible)}${escapeHtml(affected)}</summary>`,
                '',
                fullDetails,
                ...(references ? ['', references] : []),
                '',
                '</details>',
              ]
            }),
          ]
        })()
      : formatCategoryEntries(document.entries, category, metadata, 3, true)
    if (section.length) {
      sections.push(...(sections.length ? ['', ...section] : section))
    }
  }

  const contributors = uniqueContributors(document.contributors).sort((a, b) => a.localeCompare(b))
  if (contributors.length) {
    sections.push('', `### ❤️ ${localized(metadata, 'Contributors', '贡献者')}`, '', `${localized(metadata, 'Thanks to', '感谢')} ${contributors.map(formatContributor).join(' · ')}`)
  }
  if (document.compareUrls.length) {
    sections.push('', `##### [${localized(metadata, 'View changes on GitHub', '在 GitHub 查看变更')}](${document.compareUrls[0]})`)
  }
  return sections.join('\n')
}
