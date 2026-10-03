import type { WorkspaceGraphEdge } from '../../../core/workspace-graph/types'
import type { WorkspaceRemovalFile } from '../../../types/removal'
import { workspaceDependencyTypes } from '../../../core/workspace-graph/shared'
import { hash, record } from '../../deps/files'

export function removalManifestChanges(contents: Map<string, string>, references: WorkspaceGraphEdge[]): WorkspaceRemovalFile[] {
  const groups = new Map<string, WorkspaceGraphEdge[]>()
  for (const edge of references) {
    const file = edge.source === '.' ? 'package.json' : `${edge.source}/package.json`
    groups.set(file, [...groups.get(file) ?? [], edge])
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([file, edges]) => {
    const before = contents.get(file)!
    const manifest = JSON.parse(before)
    const fields: string[] = []
    for (const edge of edges) {
      const dependencies = record(manifest[edge.type])
      if (!dependencies || dependencies[edge.dependency] !== edge.specifier) {
        throw new Error(`Manifest changed while computing removal references: ${file}`)
      }
      delete dependencies[edge.dependency]
      fields.push(`${edge.type}.${edge.dependency}`)
      if (edge.type === 'peerDependencies' && Object.hasOwn(record(manifest.peerDependenciesMeta) ?? {}, edge.dependency)) {
        delete manifest.peerDependenciesMeta[edge.dependency]
        fields.push(`peerDependenciesMeta.${edge.dependency}`)
      }
    }
    for (const name of new Set(edges.map(edge => edge.dependency))) {
      if (workspaceDependencyTypes.every(section => !Object.hasOwn(record(manifest[section]) ?? {}, name))
        && Object.hasOwn(record(manifest.dependenciesMeta) ?? {}, name)) {
        delete manifest.dependenciesMeta[name]
        fields.push(`dependenciesMeta.${name}`)
      }
    }
    const indentation = before.match(/\n([\t ]+)"/)?.[1] ?? '  '
    const newline = before.includes('\r\n') ? '\r\n' : '\n'
    const after = `${JSON.stringify(manifest, null, indentation).replaceAll('\n', newline)}${before.endsWith('\n') ? newline : ''}`
    return { path: file, before, after, beforeHash: hash(before), afterHash: hash(after), fields: fields.sort() }
  })
}
