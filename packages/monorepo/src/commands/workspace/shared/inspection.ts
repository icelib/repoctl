import type { WorkspaceGraph, WorkspaceGraphNode } from '../../../core/workspace-graph/types'
import { lstat, realpath } from 'node:fs/promises'
import path from 'pathe'
import { isWithin } from '../../clean/safety'
import { readInput } from '../../deps/files'
import { parseSpecifier } from '../../deps/specifiers'

export async function relevantDiagnostics(graph: WorkspaceGraph, target: WorkspaceGraphNode, workspace: Record<string, unknown>) {
  const selected = path.join(graph.workspaceDir, target.id)
  const relevant = await Promise.all(graph.diagnostics.map(async (item) => {
    if (item.source === target.id) {
      return false
    }
    if (item.candidates.includes(target.id)) {
      return true
    }
    if (item.specifier?.startsWith('catalog:')) {
      const parsed = parseSpecifier(item.dependency, item.specifier, workspace)
      return parsed.source === null || parsed.source === target.name
    }
    const local = item.specifier?.match(/^(?:file:|link:|workspace:)(.*)$/)?.[1]
    if (item.source && local && (!item.specifier!.startsWith('workspace:') || local.startsWith('.'))) {
      const candidates = [local]
      try {
        candidates.push(decodeURIComponent(local))
      }
      catch {
        // Literal percent characters remain a valid path candidate.
      }
      for (const candidate of candidates) {
        const lexical = path.resolve(graph.workspaceDir, item.source, candidate)
        const resolved = path.resolve(await realpath(lexical).catch(() => lexical))
        if (resolved === selected || isWithin(selected, resolved)) {
          return true
        }
      }
    }
    return false
  }))
  return graph.diagnostics.filter((_, index) => relevant[index])
}

export async function manifestInputs(root: string, graph: WorkspaceGraph) {
  const contents = new Map<string, string>([['pnpm-workspace.yaml', await readInput(root, 'pnpm-workspace.yaml')]])
  const unsupported: string[] = []
  for (const node of graph.nodes) {
    const candidates = ['package.json', 'package.json5', 'package.yaml'].map(file => node.id === '.' ? file : `${node.id}/${file}`)
    const found: string[] = []
    for (const file of candidates) {
      if (await lstat(path.join(root, file)).then(() => true, (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return false
        }
        throw error
      })) {
        found.push(file)
        contents.set(file, await readInput(root, file))
      }
    }
    if (found.length !== 1 || (!found[0]!.endsWith('/package.json') && found[0] !== 'package.json')) {
      unsupported.push(...found.length ? found : candidates)
    }
  }
  return { contents, unsupported }
}
