import type { WorkspaceGraphNode } from '../../core/workspace-graph/types'
import type { PublicApiConfig, PublicApiOptions } from './types'
import { loadMonorepoConfigDetails } from '../../core/config'
import { getWorkspaceGraph, resolveWorkspaceGraphNode } from '../../core/workspace-graph'
import { discoverCleanWorkspace } from '../clean/discovery'
import { hash, record } from '../deps/files'

function configValue(input: unknown): PublicApiConfig {
  const config = record(input)
  if (!config) {
    throw new Error('tooling.apiReports must map exact workspace selectors to entry configurations.')
  }
  for (const value of Object.values(config)) {
    const item = record(value)
    const entries = record(item?.['entries'])
    if (!item || Object.keys(item).some(key => !['entries', 'tsconfig'].includes(key)) || !entries || !Object.keys(entries).length
      || (item['tsconfig'] !== undefined && typeof item['tsconfig'] !== 'string')) {
      throw new Error('Each apiReports package requires a nonempty entries map and optional tsconfig path.')
    }
    for (const [subpath, entry] of Object.entries(entries)) {
      const data = record(entry)
      if ((subpath !== '.' && !/^\.\/[\w./-]+$/iu.test(subpath)) || subpath.includes('..')
        || !data || Object.keys(data).some(key => !['entryPoint', 'baseline'].includes(key))
        || typeof data['entryPoint'] !== 'string' || typeof data['baseline'] !== 'string') {
        throw new Error('API entries require a literal public subpath, entryPoint and baseline strings.')
      }
    }
  }
  return config as unknown as PublicApiConfig
}

export async function apiReportSettings(cwd: string, options: PublicApiOptions) {
  if (options.packages !== undefined && (!Array.isArray(options.packages) || !options.packages.length || options.packages.some(value => typeof value !== 'string' || !value))) {
    throw new Error('API package selectors must be a nonempty array of exact names or ./paths.')
  }
  const timeoutMs = options.timeoutMs ?? 120000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) {
    throw new Error('API report timeout must be an integer from 1 to 600000 milliseconds.')
  }
  const { workspaceDir: root } = await discoverCleanWorkspace(cwd)
  const loaded = await loadMonorepoConfigDetails(root, { refresh: true })
  for (const layer of loaded.rawLayers) {
    if (layer.tooling?.apiReports !== undefined) {
      configValue(layer.tooling.apiReports)
    }
  }
  const config = configValue(loaded.config.tooling?.apiReports ?? {})
  const graph = await getWorkspaceGraph(root, { ignorePrivatePackage: false, ignoreRootPackage: false })
  const selected = options.packages ? new Set(options.packages.map(value => resolveWorkspaceGraphNode(graph, value).id)) : new Set(graph.nodes.map(node => node.id))
  const configured = new Map<string, { node: WorkspaceGraphNode, config: PublicApiConfig[string] }>()
  for (const [selector, value] of Object.entries(config)) {
    const node = resolveWorkspaceGraphNode(graph, selector)
    if (configured.has(node.id)) {
      throw new Error(`API report workspace is configured twice: ${node.id}`)
    }
    configured.set(node.id, { node, config: value })
  }
  const entries = [...configured.values()].filter(item => selected.has(item.node.id)).sort((a, b) => a.node.id.localeCompare(b.node.id))
  return {
    root,
    timeoutMs,
    entries,
    selection: [...selected].sort().map(id => `./${id}`),
    configurationHash: hash(JSON.stringify(entries.map(item => [item.node.id, item.node.name, item.config]))),
    skipped: graph.nodes.filter(node => selected.has(node.id) && !configured.has(node.id)).map(node => ({ workspace: node.id, reason: 'not-configured' as const })),
  }
}
