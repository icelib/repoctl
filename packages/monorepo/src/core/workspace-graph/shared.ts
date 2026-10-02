import type { WorkspaceDependencyType, WorkspaceGraph, WorkspaceGraphNode } from './types'

export const workspaceDependencyTypes: WorkspaceDependencyType[] = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']

export function compareGraphValues(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

export function normalizeDependencyTypes(types: WorkspaceDependencyType[] = workspaceDependencyTypes) {
  for (const type of types) {
    if (!workspaceDependencyTypes.includes(type)) {
      throw new Error(`Unknown dependency type: ${type}. Expected ${workspaceDependencyTypes.join(', ')}.`)
    }
  }
  return workspaceDependencyTypes.filter(type => types.includes(type))
}

export class WorkspaceGraphQueryError extends Error {
  constructor(
    public code: 'package_not_found' | 'ambiguous_package',
    public selector: string,
    public candidates: string[],
  ) {
    super(code === 'ambiguous_package'
      ? `Ambiguous workspace package ${selector}; use an explicit directory: ${candidates.map(id => `./${id}`).join(', ')}`
      : `Workspace package not found: ${selector}`)
    this.name = 'WorkspaceGraphQueryError'
  }
}

export function resolveWorkspaceGraphNode(graph: WorkspaceGraph, selector: string): WorkspaceGraphNode {
  // An explicit ./ prefix selects a directory even when it collides with a name.
  const directory = selector.replaceAll('\\', '/')
  const byName = directory.startsWith('./') ? [] : graph.nodes.filter(node => node.name === selector)
  if (byName.length > 1) {
    throw new WorkspaceGraphQueryError('ambiguous_package', selector, byName.map(node => node.id).sort(compareGraphValues))
  }
  const id = directory === './' ? '.' : directory.replace(/^\.\//, '').replace(/\/$/, '')
  const node = byName[0] ?? graph.nodes.find(node => node.id === id)
  if (!node) {
    throw new WorkspaceGraphQueryError('package_not_found', selector, [])
  }
  return node
}
