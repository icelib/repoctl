import { lstat, realpath } from 'node:fs/promises'
import path from 'pathe'

export function contained(root: string, filename: string) {
  const relative = path.relative(root, filename)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('../'))
}

export function relativePath(root: string, value: string, label: string) {
  if (!value || path.isAbsolute(value) || value.includes('\\') || /^[a-z]:/i.test(value)) {
    throw new Error(`${label} must be a relative path inside the frozen checkout`)
  }
  const filename = path.resolve(root, value)
  return filename
}

/** Check existing ancestors without creating the build output during preflight. */
export async function assertContainedPath(root: string, filename: string) {
  if (!contained(root, filename)) {
    throw new Error('Documentation path escapes the frozen checkout')
  }
  const physicalRoot = await realpath(root)
  let cursor = filename
  while (true) {
    try {
      await lstat(cursor)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      const parent = path.dirname(cursor)
      if (cursor === parent) {
        throw new Error('Cannot resolve documentation path inside the frozen checkout')
      }
      cursor = parent
      continue
    }
    // An existing but dangling symlink is not a missing directory we may create through.
    if (!contained(physicalRoot, await realpath(cursor))) {
      throw new Error('Documentation symlink escapes the frozen checkout')
    }
    return
  }
}
