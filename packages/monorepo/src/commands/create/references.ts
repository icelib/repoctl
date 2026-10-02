import type { Dirent } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'pathe'
import fs from '../../utils/fs'
import { migrateLegacyToolingReferences } from '../tooling-migration'

const rootReferenceExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.mjs',
  '.mts',
  '.ts',
])

const rootReferenceReplacements = [
  {
    from: '../../tsconfig.json',
    to: 'tsconfig.json',
  },
] as const

function normalizeRelativeSpecifier(fromDir: string, targetPath: string) {
  const relativePath = path.relative(fromDir, targetPath).split(path.sep).join('/')
  if (relativePath.startsWith('.')) {
    return relativePath
  }
  return `./${relativePath}`
}

export async function rewriteTemplateRootReferences(targetDir: string, workspaceDir: string, finalDir = targetDir) {
  let entries: Dirent<string>[]
  try {
    entries = await readdir(targetDir, { withFileTypes: true })
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }

  await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await rewriteTemplateRootReferences(entryPath, workspaceDir, path.join(finalDir, entry.name))
      return
    }

    if (!entry.isFile() || !rootReferenceExtensions.has(path.extname(entry.name))) {
      return
    }

    const originalContent = await fs.readFile(entryPath, 'utf8')
    let nextContent = migrateLegacyToolingReferences(originalContent, 'repoctl/tooling')

    for (const replacement of rootReferenceReplacements) {
      if (!nextContent.includes(replacement.from)) {
        continue
      }

      const targetPath = path.join(workspaceDir, replacement.to)
      const rewrittenSpecifier = normalizeRelativeSpecifier(finalDir, targetPath)
      nextContent = nextContent.replaceAll(replacement.from, rewrittenSpecifier)
    }

    if (nextContent !== originalContent) {
      await fs.writeFile(entryPath, nextContent, 'utf8')
    }
  }))
}
