import type { DependencyReference } from '../dependencies'
import type { PackedManifest } from '../types'
import type { ExpectedWorkspaceLocators } from './dependencies'
import { dependencyReferences } from '../dependencies'
import { consumerDependency } from './dependencies'
import { consumerApplicability } from './platform'

export interface ConsumerRuntimeClosure {
  known: ReadonlyMap<string | undefined, PackedManifest>
  references: { manifest: PackedManifest, reference: DependencyReference, name: string }[]
}

/** Follow checked runtime dependencies and peers without importing development tooling. */
export function consumerRuntimeClosure(roots: PackedManifest[], manifests: PackedManifest[], expected?: ExpectedWorkspaceLocators): ConsumerRuntimeClosure {
  const known = new Map(manifests.map(manifest => [manifest.name, manifest]))
  const visited = new Set<PackedManifest>()
  const references: ConsumerRuntimeClosure['references'] = []
  const optional = (manifest: PackedManifest, reference: DependencyReference) => reference.field === 'optionalDependencies' || (reference.field === 'peerDependencies' && manifest.peerDependenciesMeta?.[reference.alias]?.optional === true)
  const runtimeReferences = (manifest: PackedManifest) => dependencyReferences(manifest, '.').filter(reference => reference.field !== 'dependencies' || manifest.optionalDependencies?.[reference.alias] === undefined)
  const incompatible = (manifest: PackedManifest, seen = new Set<PackedManifest>()): string | undefined => {
    const applicability = consumerApplicability(manifest)
    if (applicability.status === 'not-applicable') {
      return `${manifest.name}: ${applicability.reason}`
    }
    if (seen.has(manifest)) {
      return
    }
    seen.add(manifest)
    for (const reference of runtimeReferences(manifest)) {
      if (optional(manifest, reference)) {
        continue
      }
      const name = consumerDependency({ manifest }, reference, expected)?.name ?? reference.name
      const local = known.get(name)
      const reason = local && incompatible(local, seen)
      if (reason) {
        return reason
      }
    }
  }
  const visit = (manifest: PackedManifest) => {
    if (visited.has(manifest)) {
      return
    }
    visited.add(manifest)
    for (const reference of runtimeReferences(manifest)) {
      const name = consumerDependency({ manifest }, reference, expected)?.name ?? reference.name
      const local = known.get(name)
      const reason = local && incompatible(local)
      if (reason) {
        if (optional(manifest, reference)) {
          continue
        }
        throw new Error(`Consumer required dependency ${manifest.name}>${reference.alias} is incompatible with this host: ${reason}`)
      }
      references.push({ manifest, reference, name })
      if (local) {
        visit(local)
      }
    }
  }
  roots.forEach(visit)
  return { known, references }
}
