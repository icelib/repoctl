import type { WorkspaceGraphEdge } from '../workspace-graph'

/** Iterative Kosaraju traversal avoids recursive stack overflow and cycle enumeration. */
export function findWorkspaceCycles(ids: string[], edges: WorkspaceGraphEdge[]) {
  const forward = new Map(ids.map(id => [id, [] as WorkspaceGraphEdge[]]))
  const reverse = new Map(ids.map(id => [id, [] as string[]]))
  for (const edge of edges) {
    forward.get(edge.source)!.push(edge)
    reverse.get(edge.target)!.push(edge.source)
  }
  const seen = new Set<string>()
  const order: string[] = []
  for (const id of ids) {
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    const stack: Array<{ id: string, index: number }> = [{ id, index: 0 }]
    while (stack.length) {
      const frame = stack.at(-1)!
      const edge = forward.get(frame.id)![frame.index++]
      if (!edge) {
        order.push(frame.id)
        stack.pop()
      }
      else if (!seen.has(edge.target)) {
        seen.add(edge.target)
        stack.push({ id: edge.target, index: 0 })
      }
    }
  }
  const assigned = new Set<string>()
  const cycles: Array<{ members: string[], chain: string[], edges: WorkspaceGraphEdge[] }> = []
  for (const id of order.reverse()) {
    if (assigned.has(id)) {
      continue
    }
    const members: string[] = []
    const stack = [id]
    assigned.add(id)
    while (stack.length) {
      const member = stack.pop()!
      members.push(member)
      for (const source of reverse.get(member)!) {
        if (!assigned.has(source)) {
          assigned.add(source)
          stack.push(source)
        }
      }
    }
    members.sort()
    const start = members[0]!
    if (members.length === 1 && !forward.get(start)!.some(edge => edge.target === start)) {
      continue
    }
    const allowed = new Set(members)
    const queue = [start]
    const parent = new Map<string, WorkspaceGraphEdge>()
    const visited = new Set([start])
    let closing: WorkspaceGraphEdge | undefined
    for (let i = 0; i < queue.length && !closing; i++) {
      for (const edge of forward.get(queue[i]!)!) {
        if (!allowed.has(edge.target)) {
          continue
        }
        if (edge.target === start) {
          closing = edge
          break
        }
        if (!visited.has(edge.target)) {
          visited.add(edge.target)
          parent.set(edge.target, edge)
          queue.push(edge.target)
        }
      }
    }
    const path = [closing!]
    let node = closing!.source
    while (node !== start) {
      const edge = parent.get(node)!
      path.push(edge)
      node = edge.source
    }
    path.reverse()
    cycles.push({ members, edges: path, chain: [start, ...path.map(edge => edge.target)] })
  }
  return cycles.sort((a, b) => a.members[0]! < b.members[0]! ? -1 : 1)
}
