import { lstat, readdir, realpath } from 'node:fs/promises'
import path from 'pathe'

export function relativeArtifactPath(value: string) {
  if (!value || path.isAbsolute(value) || value.includes('\\') || value.split('/').some(part => !part || ['.', '..'].includes(part)) || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new Error(`Unsafe artifact relative path: ${value}`)
  }
  return value
}

export function inside(root: string, value: string) {
  const relative = path.relative(root, value)
  return !relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('../'))
}

export async function destination(root: string, value: string) {
  if (typeof value !== 'string' || !value || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new Error('An explicit artifact output directory is required.')
  }
  const selected = path.resolve(root, value)
  const parent = path.resolve(await realpath(path.dirname(selected)))
  const output = path.join(parent, path.basename(selected))
  if (!(await lstat(parent)).isDirectory() || inside(root, output) || inside(output, root)
    || output.split('/').some(part => ['.git', 'node_modules', '.repoctl'].includes(part))) {
    throw new Error('Artifact output must be outside the source workspace, under an existing real directory, and outside Git/dependency/operation storage.')
  }
  const stat = await lstat(output).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  })
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
    throw new Error('Artifact output is linked or is not a directory.')
  }
  return { output, stat, empty: stat ? (await readdir(output)).length === 0 : true }
}
