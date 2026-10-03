import type { WorkspaceArtifactPlan } from '../../../types/artifact'
import { lstat, readFile, rm } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { receiptName } from './receipt'
import { inventory, privateFile } from './tree'

export async function verifySource(plan: WorkspaceArtifactPlan) {
  const current = await inventory(plan.workspaceDir, true)
  if (!isDeepStrictEqual(current.files, plan.inputs) || !isDeepStrictEqual(current.excluded, plan.excluded)) {
    throw new Error('Artifact source inputs changed; review a new plan. Source edits were preserved.')
  }
}

export async function inspectNativeOutput(plan: WorkspaceArtifactPlan, directory: string) {
  let files = (await inventory(directory)).files
  const excluded: string[] = []
  for (const file of [...files].reverse()) {
    if (file.path.split('/').some(privateFile)) {
      await rm(path.join(directory, file.path), { recursive: file.kind === 'directory', force: true })
      excluded.push(file.path)
    }
  }
  files = (await inventory(directory)).files
  if (files.some(file => file.path === receiptName)) {
    throw new Error('Native output contains the reserved artifact receipt path.')
  }
  const workspace = plan.selection.mode === 'prune' && plan.selection.docker ? 'full/' : ''
  const manifestPath = plan.selection.mode === 'deploy' ? 'package.json' : `${workspace}${plan.target.id}/package.json`
  const manifest = JSON.parse(await readFile(path.join(directory, manifestPath), 'utf8')) as { name?: string, dependencies?: Record<string, string> }
  if (manifest.name !== plan.target.name) {
    throw new Error('Native artifact is missing the selected package.')
  }
  if (plan.selection.mode === 'prune' && !files.some(file => file.path === 'pnpm-lock.yaml' && file.kind === 'file')) {
    throw new Error('Native prune is missing its pruned lockfile.')
  }
  if (plan.selection.mode === 'deploy') {
    if (!plan.entry || !files.some(file => file.path === plan.entry && file.kind === 'file')) {
      throw new Error(`Built runtime entry was excluded by native package files rules: ${plan.entry}`)
    }
    const modules = await lstat(path.join(directory, 'node_modules')).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    })
    if ((modules && (!modules.isDirectory() || modules.isSymbolicLink())) || (!modules && Object.keys(manifest.dependencies ?? {}).length)) {
      throw new Error('Native deploy did not produce an isolated dependency directory.')
    }
  }
  else if (plan.selection.docker && !files.some(file => file.path === `json/${plan.target.id}/package.json` && file.kind === 'file')) {
    throw new Error('Native Docker prune did not produce the selected package manifest layer.')
  }
  return { files, excluded: [...new Set([...plan.excluded, ...excluded])].sort() }
}
