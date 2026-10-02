import type { AffectedFallback, AffectedFile, AffectedGitRange } from './types'
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'

export function readAffectedGitRange(cwd: string, base = 'origin/main', head = 'HEAD') {
  const git = (args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 })
  const range: AffectedGitRange = { base, head, baseCommit: null, headCommit: null, mergeBase: null, includesWorkingTree: false }
  const fallback: AffectedFallback[] = []
  const changes = new Map<string, Set<AffectedFile['kinds'][number]>>()
  const add = (file: string, kind: AffectedFile['kinds'][number]) => {
    const kinds = changes.get(file) ?? new Set()
    kinds.add(kind)
    changes.set(file, kinds)
  }
  const diff = (args: string[]) => {
    const fields = git(['diff', '--name-status', '--no-renames', '-z', '--relative', ...args]).split('\0')
    const kinds: Record<string, AffectedFile['kinds'][number]> = { A: 'added', D: 'deleted', M: 'modified', T: 'type_changed', U: 'unmerged' }
    for (let index = 0; index < fields.length - 1; index += 2) {
      const kind = kinds[fields[index]!]
      const filename = fields[index + 1]
      if (!kind || !filename) {
        throw new Error('Unexpected Git diff record')
      }
      add(filename, kind)
    }
  }
  const fail = (code: AffectedFallback['code']) => {
    fallback.push({ code })
    return { git: range, files: [] as AffectedFile[], fallback }
  }
  try {
    if (realpathSync(git(['rev-parse', '--show-toplevel']).trim()) !== realpathSync(cwd)) {
      return fail('workspace_not_git_root')
    }
  }
  catch {
    return fail('git_unavailable')
  }
  try {
    range.baseCommit = git(['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).trim()
  }
  catch {
    return fail('base_unavailable')
  }
  try {
    range.headCommit = git(['rev-parse', '--verify', '--end-of-options', `${head}^{commit}`]).trim()
    if (range.headCommit !== git(['rev-parse', '--verify', 'HEAD']).trim()) {
      return fail('head_not_checked_out')
    }
  }
  catch {
    return fail('head_unavailable')
  }
  try {
    range.mergeBase = git(['merge-base', range.baseCommit, range.headCommit]).trim()
  }
  catch {
    return fail('merge_base_unavailable')
  }
  try {
    diff([range.mergeBase, range.headCommit])
    // Keep index and worktree changes even when they cancel each other relative to HEAD.
    diff(['--cached', range.headCommit])
    diff([])
    for (const filename of git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) {
      add(filename, 'untracked')
    }
    range.includesWorkingTree = true
  }
  catch {
    return fail('git_diff_failed')
  }
  const files: AffectedFile[] = [...changes].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, kinds]) => ({ path, kinds: [...kinds].sort() }))
  if (files.some(file => file.kinds.includes('unmerged'))) {
    fallback.push({ code: 'unmerged_changes' })
  }
  return { git: range, files, fallback }
}
