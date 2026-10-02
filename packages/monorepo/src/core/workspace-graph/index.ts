import type { WorkspaceGraph, WorkspaceGraphOptions } from './types'
import path from 'pathe'
import { clearWorkspaceCache, getWorkspaceData } from '../workspace'
import { filterWorkspaceGraph } from './query'
import { resolveGraphDependency } from './resolve'
import { compareGraphValues, normalizeDependencyTypes } from './shared'

export { filterWorkspaceGraph, getWorkspaceImpact, whyWorkspaceDependency } from './query'
export { resolveWorkspaceGraphNode, WorkspaceGraphQueryError } from './shared'
export type * from './types'

/** Read manifest relationships, including private packages by default; never writes files. */
export async function getWorkspaceGraph(cwd: string, options: WorkspaceGraphOptions = {}): Promise<WorkspaceGraph> {
  clearWorkspaceCache()
  const data = await getWorkspaceData(cwd, { ...options, ignorePrivatePackage: options.ignorePrivatePackage ?? false })
  const packages = [...data.packages].sort((a, b) => compareGraphValues(a.rootDir, b.rootDir))
  const nodes = packages.map(pkg => ({
    id: path.relative(data.workspaceDir, pkg.rootDir) || '.',
    ...(pkg.manifest.name ? { name: pkg.manifest.name } : {}),
    ...(pkg.manifest.version ? { version: pkg.manifest.version } : {}),
    private: pkg.manifest.private === true,
  }))
  const graph: WorkspaceGraph = {
    schemaVersion: 1,
    cwd: data.cwd,
    workspaceDir: data.workspaceDir,
    dependencyTypes: normalizeDependencyTypes(options.dependencyTypes),
    nodes,
    edges: [],
    diagnostics: [],
  }
  const names = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.name) {
      const ids = names.get(node.name) ?? []
      ids.push(node.id)
      names.set(node.name, ids)
    }
  }
  for (const [dependency, candidates] of [...names].sort(([a], [b]) => compareGraphValues(a, b))) {
    if (candidates.length > 1) {
      graph.diagnostics.push({ code: 'duplicate_name', dependency, candidates })
    }
  }
  for (const [index, pkg] of packages.entries()) {
    const source = nodes[index]!.id
    for (const type of graph.dependencyTypes) {
      for (const [dependency, specifier] of Object.entries(pkg.manifest[type] ?? {}).sort(([a], [b]) => compareGraphValues(a, b))) {
        const result = resolveGraphDependency(pkg, source, dependency, specifier, type, packages, nodes)
        if (result.target && result.resolution) {
          graph.edges.push({ source, target: result.target, type, dependency, specifier, resolution: result.resolution })
        }
        if (result.diagnostic) {
          graph.diagnostics.push(result.diagnostic)
        }
      }
    }
  }
  return filterWorkspaceGraph(graph, options)
}
