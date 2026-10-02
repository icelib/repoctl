import type { WorkspaceGraph } from '../../../core/workspace-graph'
import type { AffectedFile, AffectedPackage } from './types'
import { getWorkspaceImpact, resolveWorkspaceGraphNode } from '../../../core/workspace-graph'

export function selectAffectedPackages(graph: WorkspaceGraph, files: AffectedFile[], full: boolean, filters?: string[]) {
  const packages: AffectedPackage[] = graph.nodes.map(node => ({
    id: node.id,
    ...(node.name ? { name: node.name } : {}),
    selected: false,
    reasons: [],
  }))
  const byId = new Map(packages.map(pkg => [pkg.id, pkg]))
  for (const pkg of packages) {
    const direct = files.filter(file => file.owner === pkg.id).map(file => file.path)
    if (direct.length) {
      pkg.reasons.push({ code: 'direct_change', files: direct })
      for (const consumer of getWorkspaceImpact(graph, `./${pkg.id}`).consumers) {
        byId.get(consumer.id)!.reasons.push({ code: 'dependent', path: consumer.path })
      }
    }
    if (full) {
      pkg.reasons.push({ code: 'full_fallback' })
    }
  }
  const allowed = filters?.length ? new Set(filters.map(filter => resolveWorkspaceGraphNode(graph, filter).id)) : undefined
  for (const pkg of packages) {
    pkg.selected = pkg.reasons.length > 0 && (!allowed || allowed.has(pkg.id))
    if (!pkg.selected) {
      pkg.skippedReason = pkg.reasons.length ? 'filtered_out' : 'not_affected'
    }
  }
  return packages
}

export function includeBuildPrerequisites(graph: WorkspaceGraph, selected: string[]) {
  const included = new Set(selected)
  const outgoing = new Map<string, string[]>()
  for (const edge of graph.edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
  }
  const queue = [...selected]
  for (let index = 0; index < queue.length; index++) {
    for (const target of outgoing.get(queue[index]!) ?? []) {
      if (!included.has(target)) {
        included.add(target)
        queue.push(target)
      }
    }
  }
  return [...included].sort()
}
