import type { WorkspaceGraphNode } from '../workspace-graph'
import type { WorkspaceBoundaryFinding, WorkspaceBoundarySelector } from './types'

function matches(node: WorkspaceGraphNode, selector: WorkspaceBoundarySelector, tags: Map<string, Set<string>>) {
  return (selector.private === undefined || node.private === selector.private)
    && (!selector.packages || selector.packages.includes(node.name ?? ''))
    && (!selector.paths || selector.paths.some(pattern => pattern.endsWith('/**')
      ? pattern === './**' || node.id.startsWith(`${pattern.slice(0, -3)}/`)
      : node.id === pattern))
    && (!selector.tags || selector.tags.some(tag => tags.get(tag)?.has(node.id)))
}

export function selectBoundaryNodes(nodes: WorkspaceGraphNode[], selector: WorkspaceBoundarySelector, tags: Map<string, Set<string>>, field: string, findings: WorkspaceBoundaryFinding[]) {
  // Report each stale alternative, not only selectors whose combined match is empty.
  for (const key of ['packages', 'paths', 'tags'] as const) {
    for (const value of selector[key] ?? []) {
      if (!nodes.some(node => matches(node, { [key]: [value] }, tags))) {
        findings.push({ id: 'boundary-selector-unmatched', status: 'warn', field: `${field}.${key}`, detail: `No workspace matches ${key} selector ${value}.` })
      }
    }
  }
  const selected = new Set(nodes.filter(node => matches(node, selector, tags)).map(node => node.id))
  if (!selected.size) {
    findings.push({ id: 'boundary-selector-unmatched', status: 'warn', field, detail: 'The combined selector matches no workspace.' })
  }
  return selected
}
