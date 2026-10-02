import { realpath } from 'node:fs/promises'
import path from 'pathe'

/** Use the same physical directory identity as pnpm's package discovery. */
export async function resolveWorkspaceDirectory(directory: string) {
  const absolute = path.resolve(directory)
  try {
    // Normalize native Windows separators after realpath as well.
    return path.resolve(await realpath(absolute))
  }
  catch {
    // Preserve pnpm's existing missing-directory and read-error semantics.
    // Discovery still decides whether this input is empty or an error.
    return absolute
  }
}

/** Resolve directory aliases even when a planned or deleted path is absent. */
export async function resolveWorkspacePath(input: string) {
  const absolute = path.resolve(input)
  let ancestor = absolute
  const suffix: string[] = []
  while (true) {
    try {
      return path.resolve(await realpath(ancestor), ...suffix)
    }
    catch (error) {
      const parent = path.dirname(ancestor)
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === ancestor) {
        // Preserve the caller's existing error handling for unreadable paths.
        return absolute
      }
      suffix.unshift(path.basename(ancestor))
      ancestor = parent
    }
  }
}
