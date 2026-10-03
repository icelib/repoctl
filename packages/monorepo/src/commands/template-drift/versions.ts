import type { TemplateInstanceSource } from '@icebreakers/monorepo-templates'
import type { TemplateDriftOptions, TemplateVersionComparison, TemplateVersionEvidence } from './types'
import { isExactTemplateVersion, readTemplatePackageVersion } from '@icebreakers/monorepo-templates'
import { compare, valid } from 'semver'

export const templatePackageName = '@icebreakers/monorepo-templates'

export async function collectVersionEvidence(options: TemplateDriftOptions): Promise<TemplateVersionEvidence> {
  const kind = options.remote ? 'remote' : options.sourceDir ? 'extracted' : 'installed'
  try {
    let version: string
    if (options.remote) {
      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(templatePackageName)}/latest`, { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } })
      if (!response.ok) {
        throw new Error(`Registry returned HTTP ${response.status}.`)
      }
      const manifest = await response.json() as { name?: unknown, version?: unknown }
      if (manifest.name !== templatePackageName || typeof manifest.version !== 'string' || !isExactTemplateVersion(manifest.version)) {
        throw new Error('Registry response does not identify an exact template package version.')
      }
      version = manifest.version
    }
    else {
      version = await readTemplatePackageVersion(options.sourceDir)
    }
    if (!valid(version)) {
      throw new Error('The template package version cannot be compared as supported semver.')
    }
    return { kind, status: 'available', package: templatePackageName, version, detail: kind === 'remote' ? 'Explicit query of the public npm latest dist-tag.' : `Actual ${kind} template package metadata; the remote latest version was not queried.` }
  }
  catch (error) {
    return { kind, status: 'unavailable', package: templatePackageName, detail: error instanceof Error ? error.message : String(error) }
  }
}

export function compareTemplateVersion(source: TemplateInstanceSource, evidence: TemplateVersionEvidence): TemplateVersionComparison {
  const versions = { ...(source.version ? { currentVersion: source.version } : {}), ...(evidence.version ? { comparedVersion: evidence.version } : {}) }
  if (source.kind !== 'package' || source.packageName !== templatePackageName || !source.version || !isExactTemplateVersion(source.version) || !valid(source.version)) {
    return { ...versions, status: 'unknown', detail: 'The source has no comparable exact template package version.' }
  }
  if (evidence.status !== 'available' || !evidence.version) {
    return { ...versions, status: 'unknown', detail: `Version evidence is unavailable: ${evidence.detail}` }
  }
  const difference = compare(evidence.version, source.version)
  const status = difference > 0 ? 'newer' : difference < 0 ? 'ahead' : 'same'
  return { ...versions, status, detail: `Compared retained ${source.version} with ${evidence.kind} ${evidence.version}; ${status === 'newer' ? 'a newer package version is known' : status === 'ahead' ? 'the retained source is newer than this comparison package' : 'these package versions match'}.` }
}
