import type { DocsContext } from './context'
import { docsPreviewRobots } from './context'

const blockStart = '# repoctl docs preview (generated)'
const blockEnd = '# End repoctl docs preview'
const fieldsStart = '# repoctl docs preview headers (generated)'
const fieldsEnd = '# End repoctl docs preview headers'
const markers = new Map([[blockStart, blockEnd], [fieldsStart, fieldsEnd]])
const ends = new Set(markers.values())

function removeOwnedHeaders(existing: string) {
  const lines = existing.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) ?? []
  const clean: string[] = []
  let expectedEnd: string | undefined
  for (const line of lines) {
    const text = line.trim()
    const end = markers.get(text)
    if (end) {
      if (expectedEnd) {
        throw new Error('Nested repoctl documentation header markers')
      }
      expectedEnd = end
    }
    else if (ends.has(text)) {
      if (text !== expectedEnd) {
        throw new Error('Unbalanced repoctl documentation header markers')
      }
      expectedEnd = undefined
    }
    else if (/^# (?:End )?repoctl docs preview\b/.test(text)) {
      throw new Error('Malformed repoctl documentation header marker')
    }
    else if (!expectedEnd) {
      clean.push(line)
    }
  }
  if (expectedEnd) {
    throw new Error('Unbalanced repoctl documentation header markers')
  }
  return clean
}

/** Preserve owner and Nimbus headers; remove only this helper's marked preview policy. */
export function mergeDocsHeaders(existing: string, context: DocsContext): string {
  const lines = removeOwnedHeaders(existing)
  if (!context.preview) {
    return lines.join('')
  }
  const newline = existing.includes('\r\n') ? '\r\n' : '\n'
  const wildcard = lines.findIndex(line => /^\/\*[ \t]*(?:\r?\n)?$/.test(line))
  if (wildcard !== -1) {
    if (!lines[wildcard]!.endsWith('\n')) {
      lines[wildcard] += newline
    }
    lines.splice(wildcard + 1, 0, [
      `  ${fieldsStart}`,
      `  X-Robots-Tag: ${docsPreviewRobots}`,
      `  ${fieldsEnd}`,
      '',
    ].join(newline))
    return lines.join('')
  }
  const content = lines.join('')
  const separator = content && !content.endsWith('\n') ? newline : ''
  return `${content}${separator}${[blockStart, '/*', `  X-Robots-Tag: ${docsPreviewRobots}`, blockEnd, ''].join(newline)}`
}
