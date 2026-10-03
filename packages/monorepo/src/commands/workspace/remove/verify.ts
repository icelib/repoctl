import type { WorkspaceRemovalPlan } from '../../../types/removal'
import { isDeepStrictEqual } from 'node:util'
import path from 'pathe'
import { getWorkspaceGraph } from '../../../core/workspace-graph'
import { hash, readInput, record } from '../../deps/files'
import { removalGit } from './git'
import { removalReview } from './review'

export function validateRemovalPlan(plan: WorkspaceRemovalPlan) {
  if (!record(plan) || plan.schemaVersion !== 1 || plan.kind !== 'workspace-removal'
    || typeof plan.workspaceDir !== 'string' || !record(plan.selection) || !record(plan.target)
    || typeof plan.target.id !== 'string' || typeof plan.selection.target !== 'string'
    || typeof plan.selection.removeReferences !== 'boolean' || typeof plan.canApply !== 'boolean'
    || !Array.isArray(plan.inputs) || !Array.isArray(plan.files) || !Array.isArray(plan.inventory)
    || !Array.isArray(plan.workspaces) || !Array.isArray(plan.blockers) || !record(plan.review)
    || !Array.isArray(plan.nextSteps) || plan.nextSteps.some(step => typeof step !== 'string')
    || plan.inputs.some(item => !record(item) || typeof item.path !== 'string' || typeof item.hash !== 'string')
    || plan.files.some(item => !record(item) || typeof item.path !== 'string' || typeof item.before !== 'string' || typeof item.after !== 'string'
      || item.beforeHash !== hash(item.before) || item.afterHash !== hash(item.after)
      || !plan.inputs.some(input => input.path === item.path && input.hash === item.beforeHash))
    || plan.workspaces.some(item => typeof item !== 'string') || !plan.workspaces.includes(plan.target.id)
    || plan.selection.target !== `./${plan.target.id}`
    || plan.review.scope !== 'git-tracked-text-literal-matches'
    || !Array.isArray(plan.review.scanned) || !Array.isArray(plan.review.matches) || !Array.isArray(plan.review.skipped)
    || new Set(plan.inputs.map(item => item.path)).size !== plan.inputs.length
    || new Set(plan.files.map(item => item.path)).size !== plan.files.length) {
    throw new Error('Invalid workspace removal plan.')
  }
}

export async function verifyRemovalPostState(plan: WorkspaceRemovalPlan, requireHead = true) {
  const root = plan.workspaceDir
  const target = path.join(root, plan.target.id)
  const graph = await getWorkspaceGraph(root, { ignoreRootPackage: false, ignorePrivatePackage: false })
  if (!isDeepStrictEqual(graph.nodes.map(node => node.id), plan.workspaces.filter(id => id !== plan.target.id))) {
    throw new Error('The workspace package set changed during removal.')
  }
  for (const input of plan.inputs) {
    if (input.path.startsWith(`${plan.target.id}/`)) {
      continue
    }
    const expected = plan.files.find(file => file.path === input.path)?.afterHash ?? input.hash
    if (hash(await readInput(root, input.path)) !== expected) {
      throw new Error(`Removal input changed: ${input.path}`)
    }
  }
  const state = await removalGit(root, target)
  if (requireHead && !isDeepStrictEqual(state.git, plan.git)) {
    throw new Error('Git HEAD or repository identity changed during removal.')
  }
  const reviewed = await removalReview(root, plan.target.id, plan.target.name, state.tracked, [])
  if (!isDeepStrictEqual(reviewed.review, plan.review)) {
    throw new Error('The tracked source/configuration review evidence changed during removal.')
  }
}
