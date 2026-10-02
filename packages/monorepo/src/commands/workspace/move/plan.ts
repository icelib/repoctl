import type { WorkspaceMoveOptions, WorkspaceMovePlan } from '../../../types/move'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import YAML from 'yaml'
import { getWorkspaceGraph, getWorkspaceImpact, resolveWorkspaceGraphNode } from '../../../core/workspace-graph'
import { workspaceGit } from '../../../core/workspace-mutation/git'
import { workspaceInventory } from '../../../core/workspace-mutation/inventory'
import { discoverCleanWorkspace } from '../../clean/discovery'
import { validateCleanTargets } from '../../clean/safety'
import { hash, record } from '../../deps/files'
import { manifestInputs, relevantDiagnostics } from '../shared/inspection'
import { moveConfigurationChanges } from './configuration'
import { moveManifestChanges, moveWorkspaceManifest } from './manifests'
import { validateDestination, validPackageName } from './paths'
import { moveReview, readMoveReviewInputs } from './review'

export const moveNextSteps = [
  'Resolve source/configuration review tasks before building; source imports are never rewritten automatically.',
  'Run pnpm install --lockfile-only with the declared pnpm version, then pnpm install --frozen-lockfile to refresh links.',
  'Run affected workspace checks and review the Git diff before committing.',
]

export async function planWorkspaceMove(cwd: string, options: WorkspaceMoveOptions): Promise<WorkspaceMovePlan> {
  if (!options || typeof options.target !== 'string' || !options.target.trim()
    || (options.to !== undefined && typeof options.to !== 'string')
    || (options.name !== undefined && (typeof options.name !== 'string' || !validPackageName(options.name)))) {
    throw new Error('Select an exact package name or ./directory and a valid destination or npm package name.')
  }
  const workspace = await discoverCleanWorkspace(cwd)
  const root = workspace.workspaceDir
  const graph = await getWorkspaceGraph(root, { ignoreRootPackage: false, ignorePrivatePackage: false })
  const target = resolveWorkspaceGraphNode(graph, options.target)
  const directory = path.join(root, target.id)
  await validateCleanTargets(workspace, [directory])
  const to = await validateDestination(root, target.id, options.to ?? target.id, graph.nodes)
  const name = options.name ?? target.name
  if (to === target.id && name === target.name) {
    throw new Error('Choose a different directory or package name.')
  }
  if (name && name !== target.name && graph.nodes.some(node => node.id !== target.id && node.name === name)) {
    throw new Error(`A workspace already uses package name ${name}.`)
  }
  const { contents, unsupported } = await manifestInputs(root, graph)
  const inventory = await workspaceInventory(root, directory)
  const state = await workspaceGit(root, directory)
  const blockers: WorkspaceMovePlan['blockers'] = []
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
  const diagnostics = await relevantDiagnostics(graph, target, record(YAML.parse(contents.get('pnpm-workspace.yaml')!)) ?? {})
  if (diagnostics.length) {
    blockers.push({ code: 'graph_incomplete', paths: [...new Set(diagnostics.flatMap(item => item.source ? [item.source] : item.candidates))].sort() })
  }
  const reviewInputs = await readMoveReviewInputs(root, state.tracked, contents)
  const files = unsupported.length ? [] : moveManifestChanges(contents, graph, target, to, name, state.git?.root)
  const manifest = moveWorkspaceManifest(contents.get('pnpm-workspace.yaml')!, target.id, to)
  if (manifest) {
    files.push(manifest)
  }
  const configurations = moveConfigurationChanges(root, contents, target, to, name)
  files.push(...configurations.files)
  files.sort((a, b) => a.path.localeCompare(b.path))
  const dirtyFiles: string[] = []
  for (const file of files) {
    const fileState = await workspaceGit(root, path.join(root, file.path))
    if (!fileState.git || fileState.dirty) {
      dirtyFiles.push(file.path)
    }
  }
  if (dirtyFiles.length) {
    blockers.push({ code: 'dirty_inputs', paths: dirtyFiles })
  }
  const review = moveReview(root, contents, target, to, name, files, reviewInputs.scanned, reviewInputs.skipped, configurations.tasks)
  for (const entry of inventory.entries.filter(entry => entry.kind === 'symlink')) {
    review.tasks.push({ path: path.join(to, entry.path), line: 1, reason: 'Symlink text is preserved; verify its destination after moving and reinstall workspace dependencies.' })
  }
  if (!isDeepStrictEqual(graph, await getWorkspaceGraph(root, { ignoreRootPackage: false, ignorePrivatePackage: false }))) {
    throw new Error('Workspace relationships changed while planning the move.')
  }
  return {
    schemaVersion: 1,
    kind: 'workspace-move',
    workspaceDir: root,
    selection: { target: `./${target.id}`, to, ...(name ? { name } : {}) },
    target,
    destination: { id: to, ...(name ? { name } : {}) },
    canApply: blockers.length === 0,
    blockers,
    consumers: getWorkspaceImpact(graph, `./${target.id}`).consumers,
    references: graph.edges.filter(edge => edge.target === target.id || edge.source === target.id),
    diagnostics,
    files,
    inputs: [...contents].sort(([a], [b]) => a.localeCompare(b)).map(([file, content]) => ({ path: file, hash: hash(content) })),
    inventory: inventory.entries,
    workspaces: graph.nodes,
    git: state.git,
    review,
    nextSteps: [...moveNextSteps, ...(!target.private && name && name !== target.name ? [`${name} is a new npm package identity. This operation does not publish or deprecate ${target.name ?? 'the old package'}.`] : [])],
  }
}
