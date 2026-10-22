import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** Source-only release policy is explicitly delimited; consumer project values remain untouched. */
export function sanitizePublishedConfigContent(content: string) {
  const result = content.replaceAll(/^[\t ]*\/\/ repoctl-source-only:start\r?\n[\s\S]*?^[\t ]*\/\/ repoctl-source-only:end\r?\n/gmu, '')
  if (result.includes('repoctl-source-only:')) {
    throw new Error('Unbalanced source-only repoctl configuration markers')
  }
  return result
}

export async function arePublishedConfigAssetsPrepared(sourceRoot: string, assetRoot: string) {
  let source: string
  try {
    source = await readFile(path.join(sourceRoot, 'repoctl.config.ts'), 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return true
    }
    throw error
  }
  try {
    return sanitizePublishedConfigContent(source) === await readFile(path.join(assetRoot, 'repoctl.config.ts'), 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}
