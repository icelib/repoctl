import type { WorkspacePackageWithJsonPath } from '../../types/workspace'
import type { WorkspaceDependencyType, WorkspaceGraphDiagnostic, WorkspaceGraphEdge, WorkspaceGraphNode } from './types'
import { realpathSync } from 'node:fs'
import path from 'pathe'
import semver from 'semver'

interface DependencyReference {
  name?: string
  directory?: string
  range: string
  required: boolean
  resolution: WorkspaceGraphEdge['resolution']
}

export function parseDependencyReference(dependency: string, specifier: string, rootDir: string): DependencyReference | undefined {
  const workspace = specifier.startsWith('workspace:')
  const local = specifier.startsWith('link:') || specifier.startsWith('file:')
  if (local || (workspace && specifier.slice(10).startsWith('.'))) {
    const directory = path.resolve(rootDir, specifier.slice(specifier.indexOf(':') + 1))
    return { directory, range: '*', required: true, resolution: workspace ? 'workspace' : 'local' }
  }
  let name = dependency
  let range = workspace ? specifier.slice(10) : specifier
  if (workspace || specifier.startsWith('npm:')) {
    if (!workspace) {
      range = specifier.slice(4)
    }
    const separator = range.lastIndexOf('@')
    if (separator > 0) {
      name = range.slice(0, separator)
      range = range.slice(separator + 1)
    }
    else if (!workspace) {
      return undefined
    }
    if (workspace && (range === '^' || range === '~')) {
      range = '*'
    }
  }
  if (!semver.validRange(range)) {
    return workspace ? { name, range: '', required: true, resolution: 'workspace' } : undefined
  }
  return { name, range, required: workspace, resolution: workspace ? 'workspace' : 'semver' }
}

export function resolveGraphDependency(
  source: WorkspacePackageWithJsonPath,
  sourceId: string,
  dependency: string,
  specifier: string,
  type: WorkspaceDependencyType,
  packages: WorkspacePackageWithJsonPath[],
  nodes: WorkspaceGraphNode[],
): { target?: string, resolution?: WorkspaceGraphEdge['resolution'], diagnostic?: WorkspaceGraphDiagnostic } {
  const reference = parseDependencyReference(dependency, specifier, source.rootDir)
  if (!reference) {
    const alias = specifier.startsWith('npm:') ? specifier.slice(4) : undefined
    const separator = alias?.lastIndexOf('@') ?? -1
    const name = alias ? separator > 0 ? alias.slice(0, separator) : alias : dependency
    const candidates = nodes.filter(node => node.name === name).map(node => node.id)
    // Catalogs may hide an alias to any local package. Preserve that uncertainty
    // so future affected consumers can choose a conservative fallback.
    if (candidates.length || specifier.startsWith('catalog:')) {
      return { diagnostic: { code: 'unresolved_specifier', source: sourceId, dependency, type, specifier, candidates } }
    }
    return {}
  }
  let directory = reference.directory
  if (directory) {
    try {
      directory = path.normalize(realpathSync(directory))
    }
    catch {
      // A missing local target is represented by a diagnostic below.
    }
  }
  const candidates = nodes.filter((node, index) => directory
    ? packages[index]!.rootDir === directory
    : node.name === reference.name)
  const diagnostic = (code: WorkspaceGraphDiagnostic['code']) => ({
    diagnostic: { code, source: sourceId, dependency, type, specifier, candidates: candidates.map(node => node.id) },
  })
  if (!reference.range) {
    return diagnostic('invalid_specifier')
  }
  if (!candidates.length) {
    return reference.required ? diagnostic('unresolved_dependency') : {}
  }
  if (candidates.length > 1) {
    return diagnostic('ambiguous_dependency')
  }
  const target = candidates[0]!
  if (reference.required && reference.range === '*') {
    return { target: target.id, resolution: reference.resolution }
  }
  if (target.version && semver.satisfies(target.version, reference.range)) {
    return { target: target.id, resolution: reference.resolution }
  }
  return reference.required ? diagnostic('incompatible_version') : {}
}
