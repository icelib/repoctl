import type { CodeownersDiagnostic, WorkspaceOwnership } from './types'

export const beginMarker = '# BEGIN repoctl workspace owners'
export const endMarker = '# END repoctl workspace owners'

function mayOverlap(pattern: string, directory: string) {
  if (pattern.startsWith('!') || pattern.includes('[')) {
    return false // GitHub does not support negation or character ranges.
  }
  const relative = pattern.replace(/^\//u, '')
  if ((!pattern.startsWith('/') && !relative.replace(/\/$/u, '').includes('/')) || directory === '.') {
    return true // An unanchored basename can match a future descendant.
  }
  const wildcard = relative.search(/[?*]/u)
  if (wildcard >= 0) {
    // A wildcard can finish the current directory name (for example /apps/web*/).
    const prefix = relative.slice(0, wildcard)
    return directory.startsWith(prefix) || prefix.startsWith(`${directory}/`)
  }
  const fixed = relative.replace(/\/$/u, '')
  return directory === fixed || directory.startsWith(`${fixed}/`) || fixed.startsWith(`${directory}/`) || fixed === ''
}

function firstPattern(line: string) {
  return /^((?:\\ |\S)+)/u.exec(line.trim())?.[1]?.replaceAll('\\ ', ' ')
}

export function updateOwnersBlock(before: string, packages: WorkspaceOwnership[], diagnostics: CodeownersDiagnostic[]) {
  const newline = before.includes('\r\n') ? '\r\n' : '\n'
  const lines = before.split(/\r?\n/u)
  const starts = lines.flatMap((line, index) => line === beginMarker ? [index] : [])
  const ends = lines.flatMap((line, index) => line === endMarker ? [index] : [])
  if (starts.length > 1 || ends.length > 1 || starts.length !== ends.length || (starts.length === 1 && starts[0]! >= ends[0]!)) {
    diagnostics.push({ code: 'INVALID_MARKERS', severity: 'error', source: 'CODEOWNERS', message: 'Expected zero or one correctly ordered repoctl managed block.' })
    return before
  }
  const owned = packages.filter(pkg => pkg.owners.length).sort((a, b) => a.path === '.' ? -1 : b.path === '.' ? 1 : a.path.localeCompare(b.path))
  const rules = owned.map(pkg => `${pkg.path === '.' ? '*' : `/${pkg.path.replaceAll(' ', '\\ ')}/`} ${pkg.owners.join(' ')}`)
  const block = [beginMarker, ...rules, endMarker].join(newline)
  if (!starts.length) {
    return `${before}${before && !before.endsWith('\n') ? newline : ''}${block}${newline}`
  }
  const start = starts[0]!
  const end = ends[0]!
  for (let index = end + 1; index < lines.length; index++) {
    const line = lines[index]!.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const pattern = firstPattern(line)
    for (const pkg of packages.filter(pkg => pkg.owners.length)) {
      if (pattern && mayOverlap(pattern, pkg.path)) {
        diagnostics.push({ code: 'POSSIBLE_SHADOW', severity: 'warning', source: pkg.path, line: index + 1, message: `Later rule ${pattern} may override this workspace or its descendants; GitHub uses the last matching rule, including ownerless rules.` })
      }
    }
  }
  // Keep bytes outside the marked block, including comments, order, and final newline.
  const offsets = [0, ...[...before.matchAll(/\n/gu)].map(match => match.index + 1)]
  return `${before.slice(0, offsets[start])}${block}${before.slice(offsets[end]! + endMarker.length)}`
}

export function ownersDiff(file: string, before: string | null, after: string) {
  if (before === after) {
    return ''
  }
  return [`--- ${before === null ? '/dev/null' : file}`, `+++ ${file}`, `@@ -${before === null ? '0,0' : `1,${before.split('\n').length}`} +1,${after.split('\n').length} @@`, ...(before === null ? [] : before.split('\n').map(line => `-${line}`)), ...after.split('\n').map(line => `+${line}`)].join('\n')
}
