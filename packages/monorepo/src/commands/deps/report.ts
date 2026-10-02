import type { DependencyConsistencyGroup, DependencyGroupStatus, DependencyReport } from '../../types/dependencies'
import type { DependencyScan } from './scan'
import { localize } from '../../i18n'
import { matchGroup } from './policy'
import { equivalentRanges, rangesOverlap } from './specifiers'

function classify(group: DependencyConsistencyGroup) {
  const occurrences = group.occurrences
  if (group.status === 'exception') {
    return
  }
  if (occurrences.every(item => item.protocol === 'workspace')) {
    group.status = 'managed'
    group.detail = localize('Workspace references are managed by workspace/release rules.', 'workspace 引用由工作区和发布规则管理。')
    return
  }
  const ranges = occurrences.map(item => item.range)
  if (ranges.includes(null) || new Set(occurrences.map(item => item.source)).size !== 1) {
    group.status = 'uncomparable'
    group.detail = localize('The source package or protocol cannot be compared as one semver range.', '来源包或协议不能按同一个 semver 范围比较。')
    return
  }
  if (new Set(occurrences.map(item => `${item.protocol}:${item.specifier}`)).size === 1) {
    group.status = 'consistent'
    group.detail = localize('Declarations are identical.', '版本声明相同。')
    return
  }
  const knownRanges = ranges as string[]
  if (equivalentRanges(knownRanges)) {
    group.status = 'equivalent'
    group.detail = localize('Declarations differ in text but allow equivalent versions.', '声明文本不同，但允许的版本等价。')
    return
  }
  const overlap = rangesOverlap(knownRanges)
  group.status = overlap === undefined ? 'uncomparable' : overlap ? 'compatible' : 'conflict'
  group.detail = overlap === undefined
    ? localize('The range expression is too complex to prove a common version.', '版本表达式过于复杂，无法确认共同版本。')
    : overlap
      ? localize('Different ranges share a common allowed version.', '不同版本范围存在共同允许的版本。')
      : localize('Ranges have no common allowed version; declare intentional groups before aligning.', '版本范围没有共同允许的版本；统一前请声明有意保留的分组。')
}

export function dependencyReport(scan: DependencyScan): DependencyReport {
  const grouped = new Map<string, DependencyConsistencyGroup>()
  for (const occurrence of scan.occurrences) {
    const policy = matchGroup(occurrence, scan.policy)
    const key = JSON.stringify([occurrence.name, occurrence.section, policy?.name ?? 'default'])
    let group = grouped.get(key)
    if (!group) {
      group = {
        dependency: occurrence.name,
        section: occurrence.section,
        group: policy?.name ?? 'default',
        reason: policy?.reason ?? null,
        status: policy?.ignore ? 'exception' : 'consistent',
        detail: policy?.ignore ? localize('Explicit exception: ', '显式例外：') + policy.reason : '',
        occurrences: [],
      }
      grouped.set(key, group)
    }
    group.occurrences.push(occurrence)
  }
  const groups = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => group)
  const summary: Record<DependencyGroupStatus, number> = { consistent: 0, equivalent: 0, compatible: 0, conflict: 0, uncomparable: 0, managed: 0, exception: 0 }
  for (const group of groups) {
    classify(group)
    summary[group.status]++
  }
  return { schemaVersion: 1, workspaceDir: scan.workspaceDir, groups, summary }
}
