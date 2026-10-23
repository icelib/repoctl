import { lstat, realpath } from 'node:fs/promises'
import path from 'pathe'
import { DocsDiagnosticError } from '../diagnostics'

export function contained(root: string, filename: string) {
  const relative = path.relative(root, filename)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('../'))
}

export function relativePath(root: string, value: string, _label: string) {
  if (!value || path.isAbsolute(value) || value.includes('\\') || /^[a-z]:/i.test(value)) {
    throw new DocsDiagnosticError('artifact-path-invalid')
  }
  const filename = path.resolve(root, value)
  return filename
}

/** Check existing ancestors without creating the build output during preflight. */
export async function assertContainedPath(root: string, filename: string) {
  if (!contained(root, filename)) {
    throw new DocsDiagnosticError('artifact-path-invalid')
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
        throw new DocsDiagnosticError('artifact-path-invalid')
      }
      cursor = parent
      continue
    }
    // An existing but dangling symlink is not a missing directory we may create through.
    if (!contained(physicalRoot, await realpath(cursor))) {
      throw new DocsDiagnosticError('artifact-path-invalid')
    }
    return
  }
}
