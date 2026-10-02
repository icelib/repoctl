import { realpath } from 'node:fs/promises'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { findWorkspacePackages } from '@pnpm/workspace.find-packages'
import { readWorkspaceManifest } from '@pnpm/workspace.read-manifest'
import path from 'pathe'
import { localize } from '../../i18n'

/** Keep lexical package paths: resolving symlinks here would hide unsafe targets. */
export async function discoverCleanWorkspace(cwd: string) {
  const found = await findWorkspaceDir(cwd)
  if (!found) {
    throw new Error(localize('Cleanup requires a pnpm workspace.', '清理必须在 pnpm 工作区内执行。'))
  }
  const workspaceDir = path.resolve(await realpath(found))
  const manifest = await readWorkspaceManifest(workspaceDir)
  const packages = await findWorkspacePackages(workspaceDir, manifest?.packages ? { patterns: manifest.packages } : {})
  return {
    workspaceDir,
    packages: packages
      .map(pkg => ({ ...pkg, rootDir: path.resolve(pkg.rootDir) }))
      .filter(pkg => pkg.rootDir !== workspaceDir),
  }
}

export type CleanWorkspace = Awaited<ReturnType<typeof discoverCleanWorkspace>>
