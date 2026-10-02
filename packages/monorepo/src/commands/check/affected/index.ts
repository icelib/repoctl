import type { AffectedCheckOptions, AffectedCheckPlan } from './types'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { getWorkspaceGraph } from '../../../core/workspace-graph'
import { createAffectedCommands } from './commands'
import { readAffectedGitRange } from './git'
import { classifyAffectedFiles, readAffectedGlobalInputs } from './inputs'
import { selectAffectedPackages } from './selection'

export type * from './types'

/** Resolve one explainable plan; Git uncertainty expands checks rather than yielding an empty selection. */
export async function resolveAffectedCheckPlan(options: AffectedCheckOptions): Promise<AffectedCheckPlan> {
  const graph = await getWorkspaceGraph(options.cwd)
  if (!existsSync(path.join(graph.workspaceDir, 'pnpm-workspace.yaml'))) {
    throw new Error('Affected checks require a discoverable pnpm-workspace.yaml')
  }
  const changes = readAffectedGitRange(graph.workspaceDir, options.base, options.head)
  const inputs = readAffectedGlobalInputs(graph.workspaceDir, options.globalInputs)
  const fallback = [
    ...changes.fallback,
    ...classifyAffectedFiles(changes.files, graph.nodes.map(node => node.id), inputs.patterns),
  ]
  if (changes.files.some(file => file.reason !== 'documentation') || fallback.length) {
    fallback.push(...inputs.fallback)
    if (graph.diagnostics.length) {
      fallback.push({ code: 'graph_diagnostics', diagnostics: graph.diagnostics })
    }
  }
  const full = fallback.length > 0
  const packages = selectAffectedPackages(graph, changes.files, full, options.filters)
  return {
    schemaVersion: 1,
    mode: 'affected',
    cwd: graph.workspaceDir,
    git: changes.git,
    strategy: full ? 'full' : 'affected',
    fallback,
    globalInputs: inputs.patterns,
    files: changes.files,
    packages,
    commands: createAffectedCommands(graph, packages, full, !!options.filters?.length),
  }
}
