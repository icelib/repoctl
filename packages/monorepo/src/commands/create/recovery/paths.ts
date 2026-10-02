import { realpath } from 'node:fs/promises'
import path from 'pathe'

async function canonicalPath(value: string) {
  try {
    return await realpath(value)
  }
  catch {
    return path.resolve(value)
  }
}

/** Compare paths after resolving aliases such as macOS /var -> /private/var. */
export async function samePath(left: string, right: string) {
  const [leftPath, rightPath] = await Promise.all([canonicalPath(left), canonicalPath(right)])
  return leftPath === rightPath
}

export async function isPathInside(parent: string, candidate: string) {
  const [parentPath, candidatePath] = await Promise.all([canonicalPath(parent), canonicalPath(candidate)])
  const relative = path.relative(parentPath, candidatePath)
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** Require a path to be one direct child of its parent with the given prefix. */
export async function isDirectChild(parent: string, candidate: string, prefix: string) {
  if (!await samePath(parent, path.dirname(candidate))) {
    return false
  }
  return path.basename(candidate).startsWith(prefix)
}
