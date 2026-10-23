import type { DependencyReference } from '../dependencies'
import type { PackedManifest } from '../types'
import type { ExpectedWorkspaceLocators } from './dependencies'
import { dependencyReferences } from '../dependencies'
import { consumerDependency } from './dependencies'

export interface ConsumerRuntimeClosure {
  known: ReadonlyMap<string | undefined, PackedManifest>
  references: { manifest: PackedManifest, reference: DependencyReference, name: string }[]
}

/** Follow checked runtime dependencies and peers without importing development tooling. */
export function consumerRuntimeClosure(roots: PackedManifest[], manifests: PackedManifest[], expected?: ExpectedWorkspaceLocators): ConsumerRuntimeClosure {
  const known = new Map(manifests.map(manifest => [manifest.name, manifest]))
  const visited = new Set<PackedManifest>()
  const references: ConsumerRuntimeClosure['references'] = []
  const visit = (manifest: PackedManifest) => {
    if (visited.has(manifest)) {
      return
    }
    visited.add(manifest)
    for (const reference of dependencyReferences(manifest, '.')) {
      const name = consumerDependency({ manifest }, reference, expected)?.name ?? reference.name
      references.push({ manifest, reference, name })
      const local = known.get(name)
      if (local) {
        visit(local)
      }
    }
  }
  roots.forEach(visit)
  return { known, references }
}
