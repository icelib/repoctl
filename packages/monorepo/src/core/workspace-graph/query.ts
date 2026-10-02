import type { WorkspaceDependencyType, WorkspaceGraph, WorkspaceGraphEdge, WorkspaceGraphFilter, WorkspaceImpactOptions, WorkspaceImpactResult, WorkspaceWhyResult } from './types'
import { compareGraphValues, normalizeDependencyTypes, resolveWorkspaceGraphNode } from './shared'

function edgeKey(edge: WorkspaceGraphEdge) {
  return JSON.stringify([edge.source, edge.target, edge.type, edge.dependency, edge.specifier])
}

/** Keep selected packages and their immediate consumers/dependencies, without mutating the graph. */
export function filterWorkspaceGraph(graph: WorkspaceGraph, options: WorkspaceGraphFilter = {}): WorkspaceGraph {
  const dependencyTypes = normalizeDependencyTypes(options.dependencyTypes ?? graph.dependencyTypes)
  const selected = options.packages?.length
    ? new Set(options.packages.map(selector => resolveWorkspaceGraphNode(graph, selector).id))
    : undefined
  const edges = graph.edges
    .filter(edge => dependencyTypes.includes(edge.type) && (!selected || selected.has(edge.source) || selected.has(edge.target)))
    .sort((a, b) => compareGraphValues(edgeKey(a), edgeKey(b)))
  const included = selected ? new Set([...selected, ...edges.flatMap(edge => [edge.source, edge.target])]) : undefined
  return {
    ...graph,
    dependencyTypes,
    nodes: graph.nodes.filter(node => !included || included.has(node.id)).sort((a, b) => compareGraphValues(a.id, b.id)),
    edges,
    diagnostics: graph.diagnostics.filter(item => (!item.type || dependencyTypes.includes(item.type))
      && (!included || (item.source ? included.has(item.source) : item.candidates.some(id => included.has(id))))),
  }
}

function adjacency(graph: WorkspaceGraph, reverse: boolean) {
  const result = new Map<string, WorkspaceGraphEdge[]>()
  for (const edge of graph.edges) {
    const id = reverse ? edge.target : edge.source
    const edges = result.get(id) ?? []
    edges.push(edge)
    result.set(id, edges)
  }
  return result
}

/** One shortest path, found with breadth-first search; cyclic graphs never enumerate all paths. */
export function whyWorkspaceDependency(
  graph: WorkspaceGraph,
  from: string,
  to: string,
  options: { dependencyTypes?: WorkspaceDependencyType[] } = {},
): WorkspaceWhyResult {
  const filtered = filterWorkspaceGraph(graph, options)
  const source = resolveWorkspaceGraphNode(filtered, from).id
  const target = resolveWorkspaceGraphNode(filtered, to).id
  const outgoing = adjacency(filtered, false)
  const visited = new Set([source])
  const previous = new Map<string, WorkspaceGraphEdge>()
  const queue = [source]
  for (let cursor = 0; cursor < queue.length && !visited.has(target); cursor++) {
    for (const edge of outgoing.get(queue[cursor]!) ?? []) {
      if (!visited.has(edge.target)) {
        visited.add(edge.target)
        previous.set(edge.target, edge)
        queue.push(edge.target)
      }
    }
  }
  const edges: WorkspaceGraphEdge[] = []
  let current = target
  while (previous.has(current)) {
    const edge = previous.get(current)!
    edges.push(edge)
    current = edge.source
  }
  edges.reverse()
  const found = visited.has(target)
  return {
    schemaVersion: 1,
    from: source,
    to: target,
    found,
    path: found ? [source, ...edges.map(edge => edge.target)] : [],
    edges,
    dependencyTypes: filtered.dependencyTypes,
    diagnostics: filtered.diagnostics,
  }
}

/** Reverse reachability; the queried package itself is excluded even in a cycle. */
export function getWorkspaceImpact(graph: WorkspaceGraph, selector: string, options: WorkspaceImpactOptions = {}): WorkspaceImpactResult {
  const filtered = filterWorkspaceGraph(graph, options)
  const target = resolveWorkspaceGraphNode(filtered, selector).id
  const incoming = adjacency(filtered, true)
  const distance = new Map([[target, 0]])
  const next = new Map<string, string>()
  const queue = [target]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!
    if (options.direct && current !== target) {
      continue
    }
    for (const edge of incoming.get(current) ?? []) {
      if (!distance.has(edge.source)) {
        distance.set(edge.source, distance.get(current)! + 1)
        next.set(edge.source, current)
        queue.push(edge.source)
      }
    }
  }
  const consumers = queue.slice(1).sort(compareGraphValues).map((id) => {
    const path = [id]
    let current = id
    while (next.has(current)) {
      current = next.get(current)!
      path.push(current)
    }
    return { id, distance: distance.get(id)!, direct: distance.get(id) === 1, path }
  })
  return {
    schemaVersion: 1,
    target,
    directOnly: options.direct === true,
    dependencyTypes: filtered.dependencyTypes,
    consumers,
    diagnostics: filtered.diagnostics,
  }
}
