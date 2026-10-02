import { lstat, readFile } from 'node:fs/promises'
import path from 'pathe'
import { appendWorkspaceManifestPatterns, parseWorkspaceManifest } from '../../core/workspace/manifest'
import { escapeWorkspacePackagePath, isWorkspacePackageCovered, isWorkspacePackageExcluded } from '../../core/workspace/patterns'

export interface CreateWorkspaceManifestPlan {
  path: string
  changed: boolean
  pattern?: string
}

export async function readOptionalManifest(manifestPath: string) {
  try {
    return await readFile(manifestPath, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function prepareWorkspaceManifest(cwd: string, targetName: string) {
  const manifestPath = path.join(cwd, 'pnpm-workspace.yaml')
  const original = await readOptionalManifest(manifestPath)
  let manifestStat
  try {
    manifestStat = await lstat(manifestPath)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  const parsed = parseWorkspaceManifest(original ?? '')
  const { document, patterns } = parsed
  const effectivePatterns = patterns ?? ['**']
  if (isWorkspacePackageExcluded(targetName, effectivePatterns)) {
    throw new Error(`Target ${targetName} is excluded by pnpm-workspace.yaml.`)
  }
  const changed = original === null || document.contents === null || !isWorkspacePackageCovered(targetName, effectivePatterns)
  if (changed && manifestStat?.isSymbolicLink()) {
    throw new Error('Refusing to replace symbolic pnpm-workspace.yaml; update the linked manifest manually.')
  }
  const pattern = escapeWorkspacePackagePath(targetName)
  const plan: CreateWorkspaceManifestPlan = {
    path: manifestPath,
    changed,
    ...(changed ? { pattern } : {}),
  }
  const content = changed ? appendWorkspaceManifestPatterns(parsed, [pattern]) : original
  return { plan, original, content }
}
