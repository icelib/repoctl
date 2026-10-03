import type { WorkspaceGraphNode } from '../../../core/workspace-graph/types'
import type { WorkspaceMoveReview } from '../../../types/move'
import type { WorkspaceRemovalFile } from '../../../types/removal'
import { lstat } from 'node:fs/promises'
import { templateRegistryPath } from '@icebreakers/monorepo-templates'
import path from 'pathe'
import { readInput } from '../../deps/files'
import { relativeReference } from './manifests'
import { movedPath } from './paths'

const textExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.json', '.json5', '.yaml', '.yml', '.toml', '.vue', '.svelte', '.astro', '.md', '.mdx', '.html', '.css', '.scss', '.sh'])

export async function readMoveReviewInputs(root: string, tracked: string[], contents: Map<string, string>) {
  const scanned: string[] = []
  const skipped: string[] = []
  for (const file of [...new Set(tracked)].sort()) {
    // The registry has its own before/after fingerprint and atomic writer.
    if (file === 'pnpm-lock.yaml' || file === templateRegistryPath) {
      continue
    }
    const metadata = await lstat(path.join(root, file)).catch(() => null)
    if (!metadata?.isFile() || metadata.nlink > 1 || metadata.size > 1024 * 1024 || !textExtensions.has(path.extname(file))) {
      skipped.push(file)
      continue
    }
    const before = await readInput(root, file)
    if (before.includes('\0')) {
      skipped.push(file)
      continue
    }
    if (contents.has(file) && contents.get(file) !== before) {
      throw new Error(`Move input changed while planning: ${file}`)
    }
    contents.set(file, before)
    scanned.push(file)
  }
  return { scanned, skipped }
}

/** Candidates for human review, never an import resolver or a source rewrite. */
export function moveReview(root: string, contents: Map<string, string>, target: WorkspaceGraphNode, to: string, name: string | undefined, files: WorkspaceRemovalFile[], scanned: string[], skipped: string[], tasks: WorkspaceMoveReview['tasks']): WorkspaceMoveReview {
  const result: WorkspaceMoveReview = { scope: 'git-tracked-text-candidates', scanned, skipped, tasks: tasks.map(task => ({ ...task, path: movedPath(task.path, target.id, to) })) }
  for (const file of scanned) {
    const content = files.find(item => item.path === file)?.after ?? contents.get(file)!
    const directory = path.dirname(file)
    content.split(/\r?\n/u).forEach((line, index) => {
      const reasons: string[] = []
      if (target.name && name !== target.name && line.includes(target.name)) {
        reasons.push('old package name')
      }
      if (target.id !== to && line.includes(target.id)) {
        reasons.push('old workspace path')
      }
      if (target.id !== to && [...line.matchAll(/["'`](\.\.?\/[^"'`\n]+)["'`]/gu)].some(match => relativeReference(root, directory, movedPath(directory, target.id, to), match[1]!, target.id, to) !== match[1])) {
        reasons.push('relative path may need updating')
      }
      if (reasons.length) {
        result.tasks.push({ path: movedPath(file, target.id, to), line: index + 1, reason: reasons.join('; ') })
      }
    })
  }
  result.tasks.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.reason.localeCompare(b.reason))
  return result
}
