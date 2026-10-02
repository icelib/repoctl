import type { WorkspaceTaskPackage } from './types'
import { realpath } from 'node:fs/promises'
import nativePath from 'node:path'
import path from 'pathe'

/** Absolute directory queries never fall through to package-name fuzzy search. */
export async function locationCandidates(packages: WorkspaceTaskPackage[], query: string) {
  const normalizedPath = path.normalize(query)
  const normalized = normalizedPath.length > path.parse(normalizedPath).root.length
    ? normalizedPath.replace(/\/$/u, '')
    : normalizedPath
  if (path.isAbsolute(normalized) || /^[a-z]:/iu.test(query)) {
    // A Windows drive/UNC path on POSIX is a foreign path, not search text.
    // realpath also handles directory symlinks and native filesystem casing.
    if (!nativePath.isAbsolute(query)) {
      return []
    }
    let directory: string
    try {
      directory = path.normalize(await realpath(query))
    }
    catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EINVAL'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        return []
      }
      throw error
    }
    return packages.filter(pkg => path.normalize(pkg.directory) === directory)
  }
  const relative = normalized.replace(/^\.\//u, '') || '.'
  const exact = packages.filter(pkg => pkg.name === query || pkg.id === relative)
  const lower = query.toLowerCase()
  return exact.length
    ? exact
    : packages.filter(pkg => [pkg.id, pkg.name, pkg.description].some(value => value?.toLowerCase().includes(lower)))
}
