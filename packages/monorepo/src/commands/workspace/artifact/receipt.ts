import type { ArtifactFile, WorkspaceArtifactPlan } from '../../../types/artifact'
import { lstat, readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { destination } from './paths'
import { inventory } from './tree'

export const receiptName = '.repoctl-artifact.json'

export function receipt(plan: WorkspaceArtifactPlan, files: ArtifactFile[], excluded: string[]) {
  return `${JSON.stringify({ schemaVersion: 1, kind: 'repoctl-artifact', fingerprint: plan.fingerprint, mode: plan.selection.mode, entry: plan.entry, files, excluded }, null, 2)}\n`
}

export async function previousArtifact(plan: WorkspaceArtifactPlan) {
  const current = await destination(plan.workspaceDir, plan.selection.output)
  if (current.empty) {
    return null
  }
  const filename = path.join(current.output, receiptName)
  const stat = await lstat(filename).catch(() => null)
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) {
    throw new Error('Artifact output is not empty. Only an unchanged, completed artifact for this exact plan can be reused.')
  }
  let saved: Record<string, unknown>
  try {
    saved = JSON.parse(await readFile(filename, 'utf8'))
  }
  catch {
    throw new Error('Artifact output contains an invalid receipt; preserve its contents and choose an empty output directory.')
  }
  const files = (await inventory(current.output)).files.filter(file => file.path !== receiptName)
  if (saved['schemaVersion'] !== 1 || saved['kind'] !== 'repoctl-artifact' || saved['fingerprint'] !== plan.fingerprint
    || saved['mode'] !== plan.selection.mode || saved['entry'] !== plan.entry || !isDeepStrictEqual(saved['files'], files)
    || !Array.isArray(saved['excluded']) || saved['excluded'].some(item => typeof item !== 'string')) {
    throw new Error('Artifact output changed or belongs to another plan. Preserve it and choose an empty output directory.')
  }
  return { files, excluded: saved['excluded'] as string[] }
}
