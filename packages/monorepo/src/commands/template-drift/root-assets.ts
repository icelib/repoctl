import type { TemplateDriftOwner, TemplateDriftRegistry, TemplateVersionEvidence } from './types'
import { lstat, readdir } from 'node:fs/promises'
import { safeInstancePath } from '@icebreakers/monorepo-templates'
import { baselineDirectory, parseBaseline } from '../upgrade/baseline/record'
import { readOptional } from '../upgrade/plan/files'
import { compareManagedFile, errorDetail, isMissing, localDriftState } from './files'
import { compareTemplateVersion } from './versions'

export async function collectRootAssetDrift(workspaceDir: string, evidence: TemplateVersionEvidence) {
  const registry: TemplateDriftRegistry = { path: baselineDirectory, status: 'available', detail: 'Retained root asset baselines were inspected.' }
  const owners: TemplateDriftOwner[] = []
  try {
    const directory = await safeInstancePath(workspaceDir, baselineDirectory)
    if (!(await lstat(directory)).isDirectory()) {
      throw new Error('The root asset baseline registry is not a directory.')
    }
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.name.endsWith('.json')) {
        continue
      }
      const filename = `${baselineDirectory}/${entry.name}`
      try {
        const bytes = await readOptional(workspaceDir, filename)
        if (!bytes) {
          throw new Error('The retained baseline disappeared during inspection.')
        }
        const record = parseBaseline(bytes, filename)
        const source = { kind: 'package' as const, packageName: record.source.package, version: record.source.version, templatePath: record.source.assetPath, digest: record.source.hash }
        const file = await compareManagedFile(workspaceDir, record.path, record.upstream.hash)
        const owner: TemplateDriftOwner = {
          kind: 'root-asset',
          id: record.path,
          path: record.path,
          source,
          baseline: { status: 'available', detail: 'The retained root upstream baseline passed schema, path and content hash validation.' },
          version: compareTemplateVersion(source, evidence),
          local: localDriftState([file], 'available'),
          files: [file],
          recommendations: [],
        }
        if (owner.version.status === 'newer') {
          owner.recommendations.push('Review the exact template package upgrade and its root asset plan before applying changes.')
        }
        if (owner.local === 'drifted') {
          owner.recommendations.push('Review local root asset modifications or deletions; use the retained baseline when planning an upgrade.')
        }
        if (owner.local === 'unknown') {
          owner.recommendations.push('Resolve the unavailable managed path and rerun the read-only check.')
        }
        owners.push(owner)
      }
      catch (error) {
        registry.status = 'unavailable'
        registry.detail += ` Untrusted baseline ${filename}: ${errorDetail(error)}`
      }
    }
    if (!owners.length && registry.status === 'available') {
      registry.status = 'absent'
      registry.detail = 'No trustworthy root asset baselines are registered; existing root files were not inspected.'
    }
  }
  catch (error) {
    registry.status = isMissing(error) ? 'absent' : 'unavailable'
    registry.detail = isMissing(error) ? 'No root asset baselines are registered; existing root files were not inspected.' : errorDetail(error)
  }
  return { registry, owners }
}
