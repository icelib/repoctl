import type { WorkspaceGraph, WorkspaceGraphDiagnostic, WorkspaceImpactResult, WorkspaceWhyResult } from '../../../core/workspace-graph'
import os from 'node:os'
import { localize } from '../../../i18n'

export function redactWorkspaceGraph(graph: WorkspaceGraph): WorkspaceGraph {
  let serialized = JSON.stringify(graph)
  const replacements = [[graph.workspaceDir, '<workspace>'], [graph.cwd, '<cwd>'], [os.homedir(), '<home>']]
  for (const [value, replacement] of replacements.sort(([a], [b]) => b!.length - a!.length)) {
    if (value) {
      serialized = serialized.split(JSON.stringify(value).slice(1, -1)).join(replacement)
    }
  }
  return JSON.parse(serialized)
}

export function formatGraphDiagnostics(diagnostics: WorkspaceGraphDiagnostic[]) {
  return diagnostics.map(item => `! ${item.code}: ${item.source ?? '.'} ${item.dependency}${item.specifier ? ` (${item.specifier})` : ''}${item.candidates.length ? ` -> ${item.candidates.join(', ')}` : ''}`)
}

export function formatWorkspaceGraph(graph: WorkspaceGraph) {
  return [
    localize(`workspace: ${graph.workspaceDir}`, `工作区：${graph.workspaceDir}`),
    localize(`packages: ${graph.nodes.length}; dependencies: ${graph.edges.length}`, `包数量：${graph.nodes.length}；依赖边：${graph.edges.length}`),
    ...graph.nodes.map(node => `- ${node.id} (${node.name ?? localize('unnamed', '未命名')})${node.private ? ' [private]' : ''}`),
    ...graph.edges.map(edge => `  ${edge.source} -> ${edge.target} [${edge.type}] ${edge.dependency}: ${edge.specifier}`),
    ...formatGraphDiagnostics(graph.diagnostics),
  ].join('\n')
}

function mermaidLabel(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '#quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br/>').replaceAll('\r', '')
}

export function formatWorkspaceGraphMermaid(graph: WorkspaceGraph) {
  const ids = new Map(graph.nodes.map((node, index) => [node.id, `n${index}`]))
  return [
    'flowchart LR',
    ...graph.nodes.map(node => `  ${ids.get(node.id)}["${mermaidLabel(`${node.name ?? node.id} (${node.id})`)}"]`),
    ...graph.edges.map(edge => `  ${ids.get(edge.source)} -->|"${mermaidLabel(`${edge.type}: ${edge.dependency}`)}"| ${ids.get(edge.target)}`),
    // Comments retain diagnostics without creating untrusted Mermaid identifiers.
    ...formatGraphDiagnostics(graph.diagnostics).map(line => `  %% ${line.replaceAll('\n', ' ').replaceAll('\r', ' ')}`),
  ].join('\n')
}

export function formatWorkspaceWhy(result: WorkspaceWhyResult) {
  return [
    result.found
      ? localize(`Shortest dependency path: ${result.path.join(' -> ')}`, `最短依赖路径：${result.path.join(' -> ')}`)
      : localize(`No dependency path: ${result.from} -> ${result.to}`, `没有依赖路径：${result.from} -> ${result.to}`),
    ...result.edges.map(edge => `  ${edge.source} -> ${edge.target} [${edge.type}] ${edge.dependency}: ${edge.specifier}`),
    ...formatGraphDiagnostics(result.diagnostics),
  ].join('\n')
}

export function formatWorkspaceImpact(result: WorkspaceImpactResult) {
  return [
    localize(`Consumers of ${result.target}: ${result.consumers.length}`, `${result.target} 的消费者：${result.consumers.length}`),
    ...result.consumers.map(consumer => `- ${consumer.id} [${consumer.direct ? 'direct' : 'transitive'}; ${consumer.distance}] ${consumer.path.join(' -> ')}`),
    ...formatGraphDiagnostics(result.diagnostics),
  ].join('\n')
}
