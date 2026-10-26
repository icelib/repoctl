import type { AutoChangesetDecision, AutoChangesetPolicy, AutoChangesetRevision } from './types'
import { createHash } from 'node:crypto'
import { ownValue, titleType } from './selection'

export function managedPath(pullRequest: number) {
  return `.changeset/auto-pr-${pullRequest}.md`
}

const marker = /\n<!-- repoctl:auto-changeset:v1 ([\w.-]+\/[\w.-]+) (\d+) ([a-f\d]{64}) -->\n$/u

/** A content checksum protects human edits; it is not a cryptographic author identity. */
export function isManagedContent(content: string, revision: AutoChangesetRevision) {
  const match = marker.exec(content)
  if (!match || match[1] !== revision.repository || Number(match[2]) !== revision.pullRequest) {
    return false
  }
  return createHash('sha256').update(content.slice(0, match.index)).digest('hex') === match[3]
}

export function renderChangeset(packages: AutoChangesetDecision[], policy: AutoChangesetPolicy, revision: AutoChangesetRevision) {
  const type = titleType(revision.title)
  const template = (type ? ownValue(policy.summary?.byType, type) : undefined) ?? policy.summary?.template
    ?? (policy.summary?.language === 'zh-CN' ? '变更：{title}（#{number}）' : '{title} (#{number})')
  const values = {
    title: revision.title,
    number: String(revision.pullRequest),
    packages: packages.map(pkg => pkg.name).join(', '),
    level: [...new Set(packages.map(pkg => pkg.level))].join(', '),
  }
  const summary = template.replace(/\{(title|number|packages|level)\}/gu, (_, key: keyof typeof values) => values[key])
  const body = `---\n${packages.map(pkg => `${JSON.stringify(pkg.name)}: ${pkg.level}`).join('\n')}\n---\n\n${summary}\n`
  const digest = createHash('sha256').update(body).digest('hex')
  return `${body}\n<!-- repoctl:auto-changeset:v1 ${revision.repository} ${revision.pullRequest} ${digest} -->\n`
}
