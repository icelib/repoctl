import type { WorkspaceGraph, WorkspaceGraphEdge } from '../workspace-graph'
import type { WorkspaceBoundariesConfig, WorkspaceBoundariesReport } from './types'
import { dependencyTypes } from './config'
import { findWorkspaceCycles } from './cycles'
import { selectBoundaryNodes } from './selectors'

export function evaluateBoundaries(graph: WorkspaceGraph, config: WorkspaceBoundariesConfig, report: WorkspaceBoundariesReport) {
  const findings = report.findings
  const tags = new Map<string, Set<string>>()
  for (const [tag, selector] of Object.entries(config.tags ?? {}).sort(([a], [b]) => a < b ? -1 : 1)) {
    tags.set(tag, selectBoundaryNodes(graph.nodes, selector, tags, `boundaries.tags.${tag}`, findings))
  }
  const used = new Set<number>()
  const requiredDiagnostics = new Set(graph.diagnostics.filter(item => !item.type))
  if (config.cycles !== false) {
    const types = config.cycles?.dependencyTypes ?? ['dependencies', 'optionalDependencies']
    graph.diagnostics.filter(item => item.type && types.includes(item.type)).forEach(item => requiredDiagnostics.add(item))
  }
  function exempt(rule: string, edge: WorkspaceGraphEdge) {
    const index = config.exceptions?.findIndex(item => item.rule === rule && item.source === edge.source && item.target === edge.target && item.type === edge.type) ?? -1
    if (index < 0) {
      return false
    }
    used.add(index)
    let entry = report.exceptions.find(item => item.rule === rule && item.source === edge.source && item.target === edge.target && item.type === edge.type)
    if (!entry) {
      entry = { ...config.exceptions![index]!, edges: [] }
      report.exceptions.push(entry)
    }
    entry.edges.push(edge)
    return true
  }
  for (const [index, rule] of (config.rules ?? []).entries()) {
    const field = `boundaries.rules[${index}]`
    const from = selectBoundaryNodes(graph.nodes, rule.from, tags, `${field}.from`, findings)
    graph.diagnostics.filter(item => item.source && from.has(item.source) && item.type && (rule.dependencyTypes ?? dependencyTypes).includes(item.type)).forEach(item => requiredDiagnostics.add(item))
    const allowed = new Set(rule.allow.flatMap((selector, i) => [...selectBoundaryNodes(graph.nodes, selector, tags, `${field}.allow[${i}]`, findings)]))
    for (const edge of graph.edges) {
      if (!from.has(edge.source) || allowed.has(edge.target) || !(rule.dependencyTypes ?? dependencyTypes).includes(edge.type) || exempt(rule.id, edge)) {
        continue
      }
      findings.push({
        id: 'boundary-rule',
        status: rule.severity ?? 'fail',
        rule: rule.id,
        path: edge.source,
        field: `${edge.type}.${edge.dependency}`,
        detail: `Rule ${rule.id} disallows ${edge.source} -> ${edge.target} (${edge.type}.${edge.dependency}).`,
        chain: [edge.source, edge.target],
        edges: [edge],
      })
    }
  }
  if (config.cycles !== false) {
    const policy = config.cycles ?? {}
    const types = policy.dependencyTypes ?? ['dependencies', 'optionalDependencies']
    const edges = graph.edges.filter(edge => types.includes(edge.type))
    // A waiver removes only its precise edge, never every violation in an SCC.
    const cyclic = new Map<string, number>()
    for (const [index, cycle] of findWorkspaceCycles(graph.nodes.map(node => node.id), edges).entries()) {
      for (const member of cycle.members) {
        cyclic.set(member, index)
      }
    }
    const retained = edges.filter(edge => cyclic.get(edge.source) === undefined || cyclic.get(edge.source) !== cyclic.get(edge.target) || !exempt('cycle', edge))
    for (const cycle of findWorkspaceCycles(graph.nodes.map(node => node.id), retained)) {
      const edge = cycle.edges[0]!
      findings.push({ id: 'boundary-cycle', status: policy.severity ?? 'fail', rule: 'cycle', path: edge.source, field: `${edge.type}.${edge.dependency}`, detail: `Internal dependency cycle: ${cycle.chain.join(' -> ')}.`, ...cycle })
    }
  }
  config.exceptions?.forEach((exception, index) => {
    if (!used.has(index)) {
      findings.push({ id: 'boundary-exception-unused', status: 'warn', rule: exception.rule, path: exception.source, field: `boundaries.exceptions[${index}]`, detail: 'This exception matches no active violation; remove it or review its endpoints and dependency field.' })
    }
  })
  for (const diagnostic of requiredDiagnostics) {
    findings.push({ id: 'boundary-graph', status: 'fail', ...(diagnostic.source ? { path: diagnostic.source } : {}), field: diagnostic.type ? `${diagnostic.type}.${diagnostic.dependency}` : 'name', detail: `Dependency graph is incomplete for an enabled policy: ${diagnostic.code} (${diagnostic.dependency}).` })
  }
}
