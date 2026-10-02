import { lstat, readFile } from 'node:fs/promises'
import path from 'pathe'
import { safeFile } from '../deps/files'

export function generatorPath(value: string) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.isAbsolute(value) || value.split('/').some(part => !part || part === '.' || part === '..' || /[<>:"|?*]/.test(part) || [...part].some(character => character.charCodeAt(0) < 32) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || value.split('/').some(part => ['node_modules', '.git', '.repoctl', 'dist'].includes(part))) {
    throw new Error(`Expected a portable package-relative generator path: ${String(value)}`)
  }
  return value
}

/** Validate every existing ancestor even when the destination does not exist yet. */
export async function generatorFile(root: string, relative: string): Promise<string | null> {
  const parts = generatorPath(relative).split('/')
  let cursor = root
  for (const [index, part] of parts.entries()) {
    cursor = path.join(cursor, part)
    try {
      const metadata = await lstat(cursor)
      if (metadata.isSymbolicLink() || (index === parts.length - 1 ? !metadata.isFile() || metadata.nlink !== 1 : !metadata.isDirectory())) {
        throw new Error(`Linked or unsupported generator path: ${relative}`)
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }
  return readFile(await safeFile(root, relative), 'utf8')
}
