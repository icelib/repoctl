import type { Buffer } from 'node:buffer'
import path from 'pathe'
import { getWorkspacePackages } from '../../../core/workspace'
import { parseWorkspaceManifest, WorkspacePatternsError } from '../../../core/workspace/manifest'
import { readUpgradeFile } from '../files'
import { normalizeWorkspaceManifest, serializeWorkspaceManifest } from '../workspace'

export interface LegacyVersioningPlan {
  migratedLane: boolean
  blocked?: string
  workspaceContent?: Buffer
  remove: string[]
}

/** Read and validate the entire migration before changing or deleting metadata. */
export async function planLegacyVersioning(workspaceDir: string, workspaceContent?: Buffer): Promise<LegacyVersioningPlan> {
  const pre = await readUpgradeFile(path.join(workspaceDir, '.changeset/pre.json'))
  const config = await readUpgradeFile(path.join(workspaceDir, '.changeset/config.json'))
  const remove = config ? ['.changeset/config.json'] : []
  if (!pre && !config) {
    return { migratedLane: false, remove: [] }
  }
  if (config) {
    try {
      const value: unknown = JSON.parse(config.toString('utf8'))
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid legacy release configuration')
      }
    }
    catch {
      return { migratedLane: false, remove: [], blocked: 'invalid-legacy-release-config' }
    }
  }
  const content = workspaceContent ?? await readUpgradeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'))
  let parsed: ReturnType<typeof parseWorkspaceManifest>
  try {
    if (!content) {
      throw new Error('Invalid workspace manifest')
    }
    parsed = parseWorkspaceManifest(content.toString('utf8'))
    if (parsed.document.contents === null) {
      throw new Error('Empty workspace manifest')
    }
  }
  catch (error) {
    return {
      migratedLane: false,
      remove: [],
      blocked: error instanceof WorkspacePatternsError ? 'invalid-workspace-patterns' : 'invalid-workspace-manifest',
    }
  }
  const manifest = normalizeWorkspaceManifest(parsed.manifest)
  if (!pre) {
    return { migratedLane: false, remove }
  }
  let tag: string
  try {
    const state: unknown = JSON.parse(pre.toString('utf8'))
    if (!state || typeof state !== 'object' || !('mode' in state) || state.mode !== 'pre'
      || !('tag' in state) || typeof state.tag !== 'string' || !/^[a-z][a-z0-9-]*$/i.test(state.tag)) {
      throw new Error('Unknown prerelease state')
    }
    tag = state.tag
  }
  catch {
    return { migratedLane: false, remove: [], blocked: 'invalid-prerelease-state' }
  }
  const versioning = manifest['versioning']
  if (versioning !== undefined && (!versioning || typeof versioning !== 'object' || Array.isArray(versioning))) {
    return { migratedLane: false, remove: [], blocked: 'invalid-versioning-config' }
  }
  const nextVersioning = { ...versioning as Record<string, unknown> | undefined }
  const lanes = nextVersioning['lanes']
  if (lanes !== undefined && (!lanes || typeof lanes !== 'object' || Array.isArray(lanes))) {
    return { migratedLane: false, remove: [], blocked: 'invalid-versioning-lanes' }
  }
  const nextLanes = { ...lanes as Record<string, unknown> | undefined }
  // Discover against the candidate manifest even when it uses pnpm's implicit
  // default. Reading the old on-disk manifest here can migrate the wrong set.
  const packages = await getWorkspacePackages(workspaceDir, { patterns: parsed.patterns ?? ['**'] })
  for (const pkg of packages) {
    const name = pkg.manifest.name
    if (!name) {
      continue
    }
    if (nextLanes[name] !== undefined && nextLanes[name] !== tag) {
      return { migratedLane: false, remove: [], blocked: 'conflicting-versioning-lanes' }
    }
    nextLanes[name] = tag
  }
  nextVersioning['lanes'] = nextLanes
  manifest['versioning'] = nextVersioning
  try {
    return {
      migratedLane: true,
      workspaceContent: serializeWorkspaceManifest(manifest),
      remove: [...remove, '.changeset/pre.json'],
    }
  }
  catch {
    return { migratedLane: false, remove: [], blocked: 'invalid-workspace-manifest' }
  }
}
