import type { DocsSiteConfig } from '../../types/docs'
import micromatch from 'micromatch'
import { assertMainSource, git, gitOutput, isAncestor } from './git'

const contentExtension = /\.(?:md|mdx|txt|png|jpe?g|gif|webp|avif|svg|ico|pdf)$/i
const protectedFile = /(?:^|\/)(?:AGENTS\.md|SKILL\.md|CLAUDE\.md|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|repoctl\.config\.[^/]+)$/i

export function applyDocsPatches(cwd: string, source: string, sourceSha: string, commits: string[], site: DocsSiteConfig) {
  const applied: string[] = []
  for (const commit of [...new Set(commits)]) {
    assertMainSource(cwd, commit)
    if (isAncestor(cwd, commit, sourceSha)) {
      continue
    }
    const parents = git(cwd, ['rev-list', '--parents', '-n', '1', commit]).split(' ')
    if (parents.length !== 2) {
      throw new Error(`Documentation correction ${commit} must be a single-parent commit; select a dedicated correction commit`)
    }
    const parent = parents[1]!
    const files = git(cwd, ['diff', '--name-only', '--no-renames', '-z', parent, commit]).split('\0').filter(Boolean)
    const allowed = new Set(micromatch(files, site.patchPaths, { dot: true }))
    for (const file of files) {
      if (!allowed.has(file) || !contentExtension.test(file) || protectedFile.test(file)
        || /^(?:\.git|\.github|\.changeset|scripts|maintainers|skills)(?:\/|$)/.test(file)) {
        throw new Error(`Documentation correction ${commit} changes protected or unlisted path: ${file}`)
      }
      for (const ref of [parent, commit]) {
        const entry = git(cwd, ['ls-tree', ref, '--', file])
        if (entry && !entry.startsWith('100644 blob ')) {
          throw new Error(`Documentation corrections cannot change executable files or symlinks: ${file}`)
        }
      }
    }
    if (!files.length) {
      throw new Error(`Documentation correction ${commit} has no content changes`)
    }
    const patch = gitOutput(cwd, ['diff', '--binary', '--full-index', '--no-renames', parent, commit])
    try {
      git(source, ['apply', '--index', '--whitespace=nowarn', '-'], patch)
    }
    catch {
      throw new Error(`Documentation correction ${commit} conflicts with the stable source; prepare a compatible correction instead of copying main`)
    }
    applied.push(commit)
  }
  return applied
}
