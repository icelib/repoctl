import type { WorkspaceMovePlan } from '../../../types/move'
import { Buffer } from 'node:buffer'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { getWorkspaceGraph } from '../../../core/workspace-graph'
import { compareGraphValues } from '../../../core/workspace-graph/shared'
import { workspaceGit } from '../../../core/workspace-mutation/git'
import { workspaceInventory } from '../../../core/workspace-mutation/inventory'
import { hash, readInput, record } from '../../deps/files'
import { exists, movedPath } from './paths'

export function validateMovePlan(plan: WorkspaceMovePlan) {
  if (!record(plan) || plan.schemaVersion !== 1 || plan.kind !== 'workspace-move'
    || typeof plan.workspaceDir !== 'string' || !record(plan.selection) || !record(plan.target) || !record(plan.destination)
    || typeof plan.target.id !== 'string' || typeof plan.destination.id !== 'string' || plan.selection.target !== `./${plan.target.id}`
    || plan.selection.to !== plan.destination.id || plan.selection.name !== plan.destination.name
    || typeof plan.canApply !== 'boolean' || !Array.isArray(plan.blockers)
    || !Array.isArray(plan.inputs) || !Array.isArray(plan.files) || !Array.isArray(plan.inventory) || !Array.isArray(plan.workspaces)
    || plan.inputs.some(item => !record(item) || typeof item.path !== 'string' || !/^[a-f\d]{64}$/u.test(item.hash))
    || plan.files.some(item => !record(item) || typeof item.path !== 'string' || typeof item.before !== 'string' || typeof item.after !== 'string'
      || item.beforeHash !== hash(item.before) || item.afterHash !== hash(item.after)
      || !plan.inputs.some(input => input.path === item.path && input.hash === item.beforeHash))
    || new Set(plan.inputs.map(item => item.path)).size !== plan.inputs.length
    || new Set(plan.files.map(item => item.path)).size !== plan.files.length
    || !record(plan.templateInstances) || plan.templateInstances.from !== plan.target.id || plan.templateInstances.to !== plan.destination.id
    || !/^[a-f\d]{64}$/u.test(plan.templateInstances.beforeHash) || !/^[a-f\d]{64}$/u.test(plan.templateInstances.afterHash)
    || !Array.isArray(plan.templateInstances.relocations)
    || plan.templateInstances.relocations.some(item => !record(item) || !/^[a-f\d]{24}$/u.test(item.id) || typeof item.from !== 'string'
      || item.to !== movedPath(item.from, plan.target.id, plan.destination.id))) {
    throw new Error('Invalid workspace move plan.')
  }
}

export async function verifyMovePostState(plan: WorkspaceMovePlan, recoveryPaths: string[] = [], requireHead = true) {
  const root = plan.workspaceDir
  const { id: to } = plan.destination
  if (to !== plan.target.id && await exists(path.join(root, plan.target.id))) {
    throw new Error('A concurrent replacement of the original directory must be preserved.')
  }
  for (const input of plan.inputs) {
    const file = movedPath(input.path, plan.target.id, to)
    const expected = plan.files.find(change => change.path === input.path)?.afterHash ?? input.hash
    if (hash(await readInput(root, file)) !== expected) {
      throw new Error(`Move input changed: ${file}`)
    }
  }
  const entries = (await workspaceInventory(root, path.join(root, to))).entries
  const retained: string[] = []
  if (!requireHead) {
    for (const entry of entries) {
      const suffix = /\.repoctl-move-[a-f\d-]{36}\.bak$/u.exec(entry.path)
      const originalPath = suffix ? `${plan.target.id}/${entry.path.slice(0, -suffix[0].length)}` : ''
      if (entry.kind === 'file' && plan.files.some(file => file.path === originalPath && file.beforeHash === entry.hash)) {
        retained.push(path.join(root, to, entry.path))
      }
    }
  }
  const inventory = entries.filter(entry => ![...recoveryPaths, ...retained].includes(path.join(root, to, entry.path)))
  const expected = plan.inventory.map((entry) => {
    const change = plan.files.find(file => file.path === `${plan.target.id}/${entry.path}`)
    return change ? { ...entry, hash: change.afterHash, size: Buffer.byteLength(change.after), mtimeMs: 0 } : entry
  })
  const comparable = (entries: typeof inventory) => entries.map(entry => ({ ...entry, mtimeMs: entry.kind === 'directory' || plan.files.some(file => file.path === `${plan.target.id}/${entry.path}`) ? 0 : entry.mtimeMs }))
  if (!isDeepStrictEqual(comparable(inventory), comparable(expected))) {
    throw new Error('Package content changed during the move.')
  }
  const graph = await getWorkspaceGraph(root, { ignoreRootPackage: false, ignorePrivatePackage: false })
  const nodes = plan.workspaces.map(node => node.id === plan.target.id ? { ...node, ...plan.destination } : node).sort((a, b) => compareGraphValues(a.id, b.id))
  if (!isDeepStrictEqual(graph.nodes, nodes)) {
    throw new Error('Workspace membership changed during the move.')
  }
  if (requireHead && !isDeepStrictEqual((await workspaceGit(root, path.join(root, to))).git, plan.git)) {
    throw new Error('Git HEAD or repository identity changed during the move.')
  }
  return retained
}
