import type { TemplateGenerationParameters, TemplateInstance, TemplateInstanceRegistry } from './types'
import { portableRelativePath } from './paths'
import { validateRemoteInstanceSource } from './remote'

export const digestPattern = /^[a-f0-9]{64}$/u
const numericIdentifier = '(?:0|[1-9]\\d*)'
const prereleaseIdentifier = '(?:0|[1-9]\\d*|\\d*[a-z-][\\da-z-]*)'
export const exactVersionPattern = new RegExp(`^${numericIdentifier}\\.${numericIdentifier}\\.${numericIdentifier}(?:-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?(?:\\+[\\da-z-]+(?:\\.[\\da-z-]+)*)?$`, 'iu')

export function isExactTemplateVersion(value: string) {
  return exactVersionPattern.test(value)
}

export function normalizeTemplateExclusions(values: string[]) {
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) {
    throw new Error('Template exclusions must be relative file or directory paths.')
  }
  const result: string[] = []
  for (const input of values.map(value => value.endsWith('/**') ? value.slice(0, -3) : value).sort()) {
    portableRelativePath(input)
    if (/[*?[\]{}]/u.test(input)) {
      throw new Error('Template exclusions support exact files or directories, not arbitrary glob patterns.')
    }
    if (!result.some(parent => input === parent || input.startsWith(`${parent}/`))) {
      result.push(input)
    }
  }
  return result
}

function onlyFields(value: object, fields: string[]) {
  if (!value || typeof value !== 'object' || Object.keys(value).some(key => !fields.includes(key))) {
    throw new Error('Unsupported fields in template instance metadata; arbitrary user data is not stored.')
  }
}

export function generationParameters(input: TemplateGenerationParameters = {}): TemplateGenerationParameters {
  if (Object.keys(input).some(key => !['packageName', 'renameJson'].includes(key))
    || (input.packageName !== undefined && (typeof input.packageName !== 'string' || !/^[@\w./-]+$/u.test(input.packageName)))
    || (input.renameJson !== undefined && typeof input.renameJson !== 'boolean')) {
    throw new Error('Only packageName and renameJson are supported non-secret generation parameters.')
  }
  return {
    ...(input.packageName !== undefined ? { packageName: input.packageName } : {}),
    ...(input.renameJson !== undefined ? { renameJson: input.renameJson } : {}),
  }
}

export function validateInstance(instance: TemplateInstance) {
  onlyFields(instance, ['id', 'target', 'template', 'provenance', 'source', 'generator', 'parameters', 'baseline', 'excludedPaths'])
  onlyFields(instance.generator, ['profile', 'version'])
  onlyFields(instance.parameters, ['packageName', 'renameJson'])
  onlyFields(instance.source, ['kind', 'templatePath', 'packageName', 'version', 'digest', 'remote'])
  onlyFields(instance.baseline, ['status', 'original', 'rendered', 'reason'])
  if (!instance || !/^[a-f0-9]{24}$/u.test(instance.id) || typeof instance.template !== 'string' || !instance.template
    || !['created', 'linked'].includes(instance.provenance)
    || !['workspace-copy-v1', 'repo-new-v1'].includes(instance.generator?.profile)
    || !exactVersionPattern.test(instance.generator.version)) {
    throw new Error('Invalid template instance identity or generator.')
  }
  portableRelativePath(instance.target)
  if (instance.target === '.repoctl' || instance.target.startsWith('.repoctl/')) {
    throw new Error('Template instances cannot own metadata paths.')
  }
  generationParameters(instance.parameters)
  if (instance.excludedPaths !== undefined && JSON.stringify(normalizeTemplateExclusions(instance.excludedPaths)) !== JSON.stringify(instance.excludedPaths)) {
    throw new Error('Template exclusions must use sorted, canonical non-overlapping paths.')
  }
  const source = instance.source
  if (source.kind !== 'remote' || source.templatePath !== '.') {
    portableRelativePath(source.templatePath)
  }
  validateRemoteInstanceSource(source, exactVersionPattern)
  if (!['package', 'snapshot', 'remote'].includes(source.kind)
    || (source.kind === 'package' && (source.packageName !== '@icebreakers/monorepo-templates' || !exactVersionPattern.test(source.version ?? '')))
    || (source.digest !== undefined && !digestPattern.test(source.digest))) {
    throw new Error('Template source must use an exact package version or immutable snapshot.')
  }
  if (instance.baseline.status === 'available') {
    if (!digestPattern.test(instance.baseline.original) || !digestPattern.test(instance.baseline.rendered)
      || source.digest !== instance.baseline.original) {
      throw new Error('Invalid template instance baseline digests.')
    }
  }
  else if (instance.baseline.status !== 'unverified' || instance.baseline.reason !== 'source-unavailable') {
    throw new Error('Invalid template instance baseline status.')
  }
}

export function parseRegistry(content: string): TemplateInstanceRegistry {
  const registry = JSON.parse(content) as TemplateInstanceRegistry
  onlyFields(registry, ['schemaVersion', 'instances'])
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.instances)) {
    throw new Error('Unsupported template instance registry schema.')
  }
  const ids = new Set<string>()
  const targets = new Set<string>()
  for (const instance of registry.instances) {
    validateInstance(instance)
    if (ids.has(instance.id) || targets.has(instance.target)) {
      throw new Error('Duplicate template instance identity or target in registry.')
    }
    if ([...targets].some(target => target.startsWith(`${instance.target}/`) || instance.target.startsWith(`${target}/`))) {
      throw new Error('Overlapping template instance targets in registry.')
    }
    ids.add(instance.id)
    targets.add(instance.target)
  }
  return registry
}
