import type { Identity } from './state'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'pathe'

export function hash(content: Uint8Array) {
  return createHash('sha256').update(content).digest('hex')
}

export async function canonicalDirectory(directory: string): Promise<string> {
  try {
    const resolved = path.resolve(await realpath(directory))
    if (!(await lstat(resolved)).isDirectory()) {
      throw new Error(`Not a directory: ${directory}`)
    }
    return resolved
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    return path.join(await canonicalDirectory(path.dirname(directory)), path.basename(directory))
  }
}

export function relativeFile(relative: string) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(part => !part || ['.', '..', '.git'].includes(part))) {
    throw new Error(`Unsafe upgrade path: ${relative}`)
  }
  return relative
}

/** Reject linked components and non-files; missing parents are valid planned additions. */
export async function checkedFile(root: string, relative: string, owned?: Identity) {
  relativeFile(relative)
  if (await canonicalDirectory(root) !== root) {
    throw new Error(`Upgrade root changed: ${root}`)
  }
  let current = root
  const parts = relative.split('/')
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part)
    try {
      const info = await lstat(current, { bigint: true })
      const ownLink = owned && info.ino === owned.ino && info.dev === owned.dev
      if (info.isSymbolicLink() || (index < parts.length - 1 ? !info.isDirectory() : !info.isFile() || (info.nlink !== 1n && !ownLink))) {
        throw new Error(`Linked or non-file upgrade target: ${relative}`)
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  return path.join(root, relative)
}

export async function readOptional(root: string, relative: string, owned?: Identity) {
  const filename = await checkedFile(root, relative, owned)
  try {
    return await readFile(filename)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}
