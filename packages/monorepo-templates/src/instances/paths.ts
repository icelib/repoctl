import fs from 'node:fs/promises'
import path from 'node:path'

export const templateRegistryPath = '.repoctl/template-instances.json'
export const templateBaselineDirectory = '.repoctl/template-baselines'

export function portableRelativePath(value: string) {
  if (!value || value.includes('\\') || value.includes('\0') || path.isAbsolute(value)
    || /^[a-z]:/iu.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe template instance path: ${value}`)
  }
  return value
}

/** Reject links in every existing ancestor, including a missing leaf's parents. */
export async function safeInstancePath(workspaceDir: string, relativePath: string) {
  const relative = portableRelativePath(relativePath)
  const root = await fs.realpath(workspaceDir)
  let current = root
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    try {
      const stat = await fs.lstat(current)
      if (stat.isSymbolicLink()) {
        throw new Error(`Symlinks are not supported in template instance paths: ${relative}`)
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  return current
}

export function instanceRelativePath(workspaceDir: string, targetDir: string) {
  const relative = path.relative(path.resolve(workspaceDir), path.resolve(targetDir)).split(path.sep).join('/')
  portableRelativePath(relative)
  if (relative === '.repoctl' || relative.startsWith('.repoctl/')) {
    throw new Error('Template instances cannot own the workspace metadata directory.')
  }
  return relative
}

export async function exists(file: string) {
  try {
    await fs.lstat(file)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}
