import type { WorkspaceRemovalBlocker, WorkspaceRemovalOptions, WorkspaceRemovalPlan } from '../../../types/removal'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import YAML from 'yaml'
import { getWorkspaceGraph, getWorkspaceImpact, resolveWorkspaceGraphNode } from '../../../core/workspace-graph'
import { discoverCleanWorkspace } from '../../clean/discovery'
import { validateCleanTargets } from '../../clean/safety'
import { hash, record } from '../../deps/files'
import { manifestInputs, relevantDiagnostics } from '../shared/inspection'
import { removalGit } from './git'
import { removalInventory } from './inventory'
import { removalManifestChanges } from './manifests'
import { removalReview } from './review'

export const removalNextSteps = [
  'Review remaining source/configuration reference candidates; the literal text scan is not an exhaustive import or configuration analysis.',
  'Run pnpm install --lockfile-only with the declared pnpm version, then pnpm install --frozen-lockfile.',
  'Run the remaining workspace checks and review the Git diff before committing.',
]

export async function planWorkspaceRemoval(cwd: string, options: WorkspaceRemovalOptions): Promise<WorkspaceRemovalPlan> {
  if (!options || typeof options.target !== 'string' || !options.target.trim()
    || (options.removeReferences !== undefined && typeof options.removeReferences !== 'boolean')) {
    throw new Error('Select one workspace package by exact name or explicit ./directory.')
  }
  const workspace = await discoverCleanWorkspace(cwd)
  const root = workspace.workspaceDir
  const graph = await getWorkspaceGraph(root, { ignoreRootPackage: false, ignorePrivatePackage: false })
  const target = resolveWorkspaceGraphNode(graph, options.target)
  const directory = path.join(root, target.id)
  await validateCleanTargets(workspace, [directory])
  const { contents, unsupported } = await manifestInputs(root, graph)
  const inventory = await removalInventory(root, directory)
  const state = await removalGit(root, directory)
  const blockers: WorkspaceRemovalBlocker[] = []
  if (!state.git) {
    blockers.push({ code: 'git_unavailable', paths: [target.id] })
  }
  else if (state.dirty) {
    blockers.push({ code: 'dirty_target', paths: [target.id] })
  }
  if (unsupported.length) {
    blockers.push({ code: 'unsupported_manifest', paths: unsupported.sort() })
  }
  if (inventory.repositories.length) {
    blockers.push({ code: 'nested_repository', paths: inventory.repositories })
  }
  const references = graph.edges.filter(edge => edge.target === target.id && edge.source !== target.id)
  const consumers = getWorkspaceImpact(graph, `./${target.id}`).consumers
  if (references.length && !options.removeReferences) {
    blockers.push({ code: 'consumers', paths: consumers.map(item => item.id) })
  }
  const diagnostics = await relevantDiagnostics(graph, target, record(YAML.parse(contents.get('pnpm-workspace.yaml')!)) ?? {})
  if (diagnostics.length) {
    blockers.push({ code: 'graph_incomplete', paths: [...new Set(diagnostics.flatMap(item => item.source ? [item.source] : item.candidates))].sort() })
  }
  const files = options.removeReferences && !unsupported.length ? removalManifestChanges(contents, references) : []
  const reviewed = await removalReview(root, target.id, target.name, state.tracked, files)
  const inputs = new Map(reviewed.inputs.map(item => [item.path, item.hash]))
  for (const [file, content] of contents) {
    if (inputs.has(file) && inputs.get(file) !== hash(content)) {
      throw new Error(`Removal input changed while planning: ${file}`)
    }
    inputs.set(file, hash(content))
  }
  if (!isDeepStrictEqual(graph, await getWorkspaceGraph(root, { ignoreRootPackage: false, ignorePrivatePackage: false }))) {
    throw new Error('Workspace relationships changed while planning removal. Generate a new plan.')
  }
  return {
    schemaVersion: 1,
    kind: 'workspace-removal',
    workspaceDir: root,
    selection: { target: `./${target.id}`, removeReferences: options.removeReferences === true },
    target,
    canApply: blockers.length === 0,
    blockers,
    consumers,
    references,
    diagnostics,
    files,
    inputs: [...inputs].sort(([a], [b]) => a.localeCompare(b)).map(([file, digest]) => ({ path: file, hash: digest })),
    inventory: inventory.entries,
    workspaces: graph.nodes.map(node => node.id),
    git: state.git,
    review: reviewed.review,
    nextSteps: [...removalNextSteps],
  }
}
