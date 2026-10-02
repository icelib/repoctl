import type { PackedManifest } from './types'
import path from 'node:path'

export interface DependencyReference {
  alias: string
  name: string
  range: string
  field: string
  protocol: 'registry' | 'workspace' | 'file' | 'link'
  directory?: string
}

function namedSpec(spec: string) {
  const match = /^(@[^/]+\/[^@]+|[^@/]+)@(.+)$/u.exec(spec)
  return match ? { name: match[1]!, range: match[2]! } : undefined
}

export function dependencyReferences(manifest: PackedManifest, directory: string): DependencyReference[] {
  const references: DependencyReference[] = []
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
    for (const [alias, spec] of Object.entries(manifest[field] ?? {})) {
      let reference: DependencyReference = { alias, name: alias, range: spec, field, protocol: 'registry' }
      if (spec.startsWith('npm:')) {
        reference = { ...reference, ...(namedSpec(spec.slice(4)) ?? { name: spec.slice(4), range: '*' }) }
      }
      else if (spec.startsWith('workspace:')) {
        const value = spec.slice(10)
        reference = { ...reference, protocol: 'workspace', range: value, ...namedSpec(value) }
        if (value.startsWith('.') || path.isAbsolute(value)) {
          reference.directory = path.resolve(directory, value)
        }
      }
      else if (spec.startsWith('file:') || spec.startsWith('link:')) {
        reference = { ...reference, protocol: spec.startsWith('file:') ? 'file' : 'link', directory: path.resolve(directory, spec.slice(5)) }
      }
      references.push(reference)
    }
  }
  return references
}
