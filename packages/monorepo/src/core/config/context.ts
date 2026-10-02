import { findWorkspaceDir } from '@pnpm/find-workspace-dir'

/** Workspace-wide commands always consume root policy, even when invoked in a package. */
export async function commandConfigDirectory(name: string, cwd: string) {
  return ['clean', 'deps'].includes(name) ? await findWorkspaceDir(cwd) ?? cwd : cwd
}
