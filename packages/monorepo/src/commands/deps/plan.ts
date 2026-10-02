import type { DependencyFixOptions, DependencyFixPlan } from '../../types/dependencies'
import type { DependencyScan } from './scan'
import { localize } from '../../i18n'
import { hash, updateManifest } from './files'
import { dependencySections } from './policy'
import { dependencyReport } from './report'
import { parseSpecifier, rangesOverlap } from './specifiers'

export const dependencyNextSteps = ['pnpm install --lockfile-only', 'pnpm install --frozen-lockfile']

export function prepareDependencyFix(scan: DependencyScan, options: DependencyFixOptions) {
  if (!options || typeof options.dependency !== 'string' || !options.dependency.trim()
    || !dependencySections.includes(options.section) || typeof options.to !== 'string' || !options.to.trim()
    || (options.group !== undefined && (typeof options.group !== 'string' || !options.group))) {
    throw new Error(localize('Select a dependency, dependency section and explicit target specifier.', '请明确选择依赖名称、依赖分区和目标版本声明。'))
  }
  const selection = { ...options, group: options.group ?? 'default' }
  const group = dependencyReport(scan).groups.find(item => item.dependency === selection.dependency && item.section === selection.section && item.group === selection.group)
  if (!group) {
    throw new Error(localize('No dependency declarations match this selection.', '没有依赖声明符合当前选择。'))
  }
  if (!['consistent', 'equivalent', 'compatible'].includes(group.status)) {
    throw new Error(localize(`Cannot align ${group.status} declarations: ${group.detail}`, `不能统一 ${group.status} 声明：${group.detail}`))
  }
  const target = parseSpecifier(selection.dependency, selection.to)
  if (!['semver', 'npm'].includes(target.protocol) || !target.range
    || group.occurrences.some(item => item.protocol !== target.protocol || item.source !== target.source)) {
    throw new Error(localize('Fixes require comparable semver declarations or npm aliases of the same source. Managed and unknown protocols are report-only.', '修复仅支持可比较的 semver 声明或来源相同的 npm alias；受管及未知协议仅报告。'))
  }
  if (rangesOverlap([...group.occurrences.map(item => item.range!), target.range]) !== true) {
    throw new Error(localize('The target has no proven common version with the selected declarations; incompatible upgrades require a separate change.', '目标与所选声明没有可确认的共同版本；不兼容升级需要单独处理。'))
  }
  const updates = group.occurrences.filter(item => item.specifier !== selection.to).map((item) => {
    const original = scan.contents.get(item.path)!
    const content = updateManifest(original, item.section, item.name, selection.to)
    return { path: item.path, original, content, change: {
      path: item.path,
      beforeHash: hash(original),
      afterHash: hash(content),
      section: item.section,
      dependency: item.name,
      before: item.specifier,
      after: selection.to,
    } }
  })
  const plan: DependencyFixPlan = {
    schemaVersion: 1,
    workspaceDir: scan.workspaceDir,
    selection,
    inputs: scan.inputs,
    files: updates.map(item => item.change),
    nextSteps: [...dependencyNextSteps],
  }
  return { plan, updates }
}
