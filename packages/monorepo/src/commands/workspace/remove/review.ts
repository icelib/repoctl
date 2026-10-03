import type { WorkspaceRemovalFile, WorkspaceRemovalPlan } from '../../../types/removal'
import { lstat } from 'node:fs/promises'
import path from 'pathe'
import { hash, readInput } from '../../deps/files'

const textExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.json', '.json5', '.yaml', '.yml', '.toml', '.vue', '.svelte', '.astro', '.md', '.mdx', '.html', '.css', '.scss', '.sh'])

/** Literal review evidence only; neither import resolution nor generated/untracked code is inspected. */
export async function removalReview(root: string, target: string, name: string | undefined, tracked: string[], changes: WorkspaceRemovalFile[]) {
  const review: WorkspaceRemovalPlan['review'] = { scope: 'git-tracked-text-literal-matches', scanned: [], matches: [], skipped: [] }
  const inputs: { path: string, hash: string }[] = []
  const values = [...new Set([target, ...(name ? [name] : [])])]
  for (const file of [...new Set(tracked)].sort()) {
    if (file === target || file.startsWith(`${target}/`) || file === 'pnpm-lock.yaml') {
      continue
    }
    const metadata = await lstat(path.join(root, file)).catch(() => null)
    if (!metadata?.isFile() || metadata.nlink > 1 || metadata.size > 1024 * 1024 || !textExtensions.has(path.extname(file))) {
      review.skipped.push(file)
      continue
    }
    const original = await readInput(root, file)
    if (original.includes('\0')) {
      review.skipped.push(file)
      continue
    }
    review.scanned.push(file)
    inputs.push({ path: file, hash: hash(original) })
    const content = changes.find(change => change.path === file)?.after ?? original
    const matches = values.filter(value => content.includes(value))
    if (matches.length) {
      review.matches.push({ path: file, values: matches })
    }
  }
  return { review, inputs }
}
