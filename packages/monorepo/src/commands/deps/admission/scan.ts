import type { WorkspaceGraphNode } from '../../../core/workspace-graph'
import type { DependencyOccurrence } from '../../../types/dependencies'
import type { AdmissionDeclaration } from './types'
import { realpath } from 'node:fs/promises'
import path from 'pathe'
import { satisfies, validRange } from 'semver'
import YAML from 'yaml'
import { getWorkspaceGraph } from '../../../core/workspace-graph'
import { record } from '../files'
import { scanDependencies } from '../scan'
import { parseSpecifier } from '../specifiers'

export interface AdmissionInput {
  declaration: AdmissionDeclaration
  problem?: string
}

function catalogValue(name: string, specifier: string, workspace: Record<string, unknown>) {
  if (!specifier.startsWith('catalog:')) {
    return specifier
  }
  const key = specifier.slice(8) || 'default'
  const catalogs = record(workspace['catalogs'])
  if (key === 'default' && workspace['catalog'] != null && catalogs?.['default'] != null) {
    return null
  }
  const entries = key === 'default' ? record(workspace['catalog'] ?? catalogs?.['default']) : record(catalogs?.[key])
  const value = entries?.[name]
  return typeof value === 'string' && !value.startsWith('catalog:') ? value : null
}

function targetName(item: DependencyOccurrence, effective: string) {
  if (!effective.startsWith('npm:')) {
    return item.name
  }
  return /^npm:((?:@[^/@\s]+\/)?[^/@\s]+)(?:@\S+)?$/u.exec(effective)?.[1] ?? null
}

async function internalReason(item: DependencyOccurrence, effective: string, target: string | null, root: string, nodes: WorkspaceGraphNode[]) {
  if (effective.startsWith('workspace:')) {
    return 'explicit-workspace-protocol'
  }
  if (/^(?:file|link):/u.test(effective)) {
    let directory = path.resolve(root, item.workspace, effective.slice(effective.indexOf(':') + 1))
    try {
      directory = path.normalize(await realpath(directory))
    }
    catch {
      // An external or nonexistent local artifact is checked by its declared name.
    }
    if (nodes.some(node => path.resolve(root, node.id) === directory)) {
      return 'local-workspace-directory'
    }
  }
  const parsed = parseSpecifier(item.name, effective)
  if (target && parsed.range && validRange(parsed.range) && nodes.some(node => node.name === target && node.version && satisfies(node.version, parsed.range!))) {
    return 'matching-local-candidate'
  }
  return null
}

export async function scanAdmission(cwd: string) {
  const scan = await scanDependencies(cwd, { policy: false })
  const graph = await getWorkspaceGraph(scan.workspaceDir, { ignoreRootPackage: false, ignorePrivatePackage: false })
  const workspace = record(YAML.parse(scan.contents.get('pnpm-workspace.yaml')!)) ?? {}
  const declarations: AdmissionInput[] = []
  const skipped: Array<AdmissionDeclaration & { reason: string }> = []
  for (const item of scan.occurrences) {
    const effective = catalogValue(item.name, item.specifier, workspace)
    const target = effective === null ? null : targetName(item, effective)
    const declaration: AdmissionDeclaration = { workspace: item.workspace, path: item.path, section: item.section, name: item.name, target }
    const internal = effective === null ? null : await internalReason(item, effective, target, scan.workspaceDir, graph.nodes)
    if (internal === 'matching-local-candidate') {
      declarations.push({ declaration, problem: 'This semver declaration could resolve locally or from a registry. Use workspace: for internal dependencies before evaluating admission.' })
    }
    else if (internal) {
      skipped.push({ ...declaration, reason: internal })
    }
    else {
      declarations.push({ declaration, ...(!target ? { problem: 'Cannot resolve a catalog or npm alias target; review its declaration before evaluating policy.' } : {}) })
    }
  }
  return { workspaceDir: scan.workspaceDir, declarations, skipped, nodes: graph.nodes }
}

export function matchesWorkspace(selector: string, node: WorkspaceGraphNode) {
  return selector === '*' || selector === node.id || selector === node.name
    || (selector.endsWith('/**') && node.id.startsWith(`${selector.slice(0, -3)}/`))
}

export function matchesDependency(pattern: string, name: string) {
  return pattern.endsWith('/*') ? name.startsWith(pattern.slice(0, -1)) : pattern === name
}
