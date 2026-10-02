import type { PackageJson } from '../../types'
import { lstat, realpath, stat } from 'node:fs/promises'
import path from 'pathe'
import fs from '../../utils/fs'

export async function pathEntryExists(target: string) {
  try {
    await lstat(target)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

export async function validateCreateTarget(cwd: string, targetDir: string) {
  const relative = path.relative(cwd, targetDir)
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error('The target must be a directory inside the workspace.')
  }
  const workspaceRoot = await realpath(cwd)
  let ancestor = path.dirname(targetDir)
  while (!await pathEntryExists(ancestor)) {
    ancestor = path.dirname(ancestor)
  }
  const resolvedAncestor = await realpath(ancestor)
  const resolvedRelative = path.relative(workspaceRoot, resolvedAncestor)
  if (resolvedRelative === '..' || resolvedRelative.startsWith('../') || path.isAbsolute(resolvedRelative)) {
    throw new Error('The target parent resolves outside the workspace.')
  }
}

export async function validateCreateSource(sourceDir: string) {
  const source = await stat(sourceDir)
  if (!source.isDirectory()) {
    throw new Error(`Template source is not a directory: ${sourceDir}`)
  }
  const manifestPath = path.join(sourceDir, 'package.json')
  if (!await pathEntryExists(manifestPath)) {
    return undefined
  }
  const manifest: unknown = await fs.readJson(manifestPath)
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`Template package.json must contain an object: ${manifestPath}`)
  }
  return manifest as PackageJson
}
