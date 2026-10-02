import type { DependenciesCommandConfig, DependencyOccurrence, DependencyVersionGroup } from '../../types/dependencies'
import { localize } from '../../i18n'

export const dependencySections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const

export function validatePolicy(config: DependenciesCommandConfig) {
  if (config.groups !== undefined && !Array.isArray(config.groups)) {
    throw new Error(localize('commands.deps.groups must be an array.', 'commands.deps.groups 必须是数组。'))
  }
  const names = new Set(['default'])
  for (const group of config.groups ?? []) {
    if (!group || typeof group.name !== 'string' || !group.name.trim() || names.has(group.name)
      || typeof group.reason !== 'string' || !group.reason.trim()
      || !Array.isArray(group.workspaces) || !group.workspaces.length || group.workspaces.some(value => typeof value !== 'string' || !value)
      || !Array.isArray(group.dependencies) || !group.dependencies.length || group.dependencies.some(value => typeof value !== 'string' || !value)
      || (group.sections !== undefined && (!Array.isArray(group.sections) || !group.sections.length || group.sections.some(value => !dependencySections.includes(value))))
      || (group.ignore !== undefined && typeof group.ignore !== 'boolean')) {
      throw new Error(localize('Dependency groups require a unique name, a reason and explicit workspace/dependency selectors.', '依赖分组必须提供唯一名称、原因以及明确的工作区和依赖选择器。'))
    }
    names.add(group.name)
  }
  return config.groups ?? []
}

export function matchGroup(occurrence: DependencyOccurrence, groups: DependencyVersionGroup[]) {
  const matches = groups.filter(group => group.workspaces.includes(occurrence.workspace)
    && group.dependencies.includes(occurrence.name)
    && (!group.sections || group.sections.includes(occurrence.section)))
  if (matches.length > 1) {
    throw new Error(localize(`Overlapping dependency groups for ${occurrence.path}: ${occurrence.section}.${occurrence.name}`, `依赖分组重叠：${occurrence.path} 的 ${occurrence.section}.${occurrence.name}`))
  }
  return matches[0]
}
