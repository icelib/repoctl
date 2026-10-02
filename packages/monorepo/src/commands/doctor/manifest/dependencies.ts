import type { DoctorCheck } from '../types'
import type { DoctorManifest } from './types'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { satisfies, valid } from 'semver'
import { parseDependencyReference } from '../../../core/workspace-graph/resolve'
import { workspaceDependencyTypes } from '../../../core/workspace-graph/shared'
import { parseSpecifier, rangesOverlap } from '../../deps/specifiers'
import { finding } from './finding'
import { record } from './types'

function canonical(directory: string) {
  try {
    return realpathSync(directory)
  }
  catch {
    return path.resolve(directory)
  }
}

export function dependencyChecks(entry: DoctorManifest, manifests: DoctorManifest[], selected?: ReadonlySet<string>): DoctorCheck[] {
  const includes = (id: string) => !selected || selected.has(`manifest-${id}`)
  const resolveTargets = ['self-dependency', 'workspace-specifier', 'workspace-target', 'workspace-ambiguous', 'workspace-unreadable', 'workspace-version-unknown', 'workspace-version-mismatch'].some(includes)
  const data = entry.data!
  const checks: DoctorCheck[] = []
  const declarations = new Map<string, { section: string, specifier: string }[]>()
  for (const section of workspaceDependencyTypes) {
    if (data[section] === undefined) {
      continue
    }
    const dependencies = record(data[section])
    if (!dependencies) {
      if (includes('dependency-section')) {
        checks.push(finding(entry, 'dependency-section', section, 'fail', 'Dependency sections must be objects mapping names to specifiers.', '依赖分区必须是包名到版本声明的对象。'))
      }
      continue
    }
    for (const [name, specifier] of Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))) {
      const field = `${section}.${name}`
      if (typeof specifier !== 'string' || !specifier.trim()) {
        if (includes('dependency-specifier')) {
          checks.push(finding(entry, 'dependency-specifier', field, 'fail', 'A dependency specifier must be a nonempty string.', '依赖声明必须为非空字符串。'))
        }
        continue
      }
      const existing = declarations.get(name) ?? []
      existing.push({ section, specifier })
      declarations.set(name, existing)
      if (!resolveTargets) {
        continue
      }
      const reference = parseDependencyReference(name, specifier, entry.directory)
      const targets = reference?.directory
        ? manifests.filter(target => target.directory === canonical(reference.directory!))
        : reference?.name ? manifests.filter(target => target.data?.['name'] === reference.name) : []
      if (includes('self-dependency') && ((typeof reference?.name === 'string' && reference.name === data['name']) || targets.some(target => target.directory === entry.directory))) {
        checks.push(finding(entry, 'self-dependency', field, 'fail', 'A package must not depend on itself, including through an alias.', '包不能依赖自身，包括通过别名引用自身。'))
      }
      if (!specifier.startsWith('workspace:')) {
        continue
      }
      if (!reference?.range) {
        if (includes('workspace-specifier')) {
          checks.push(finding(entry, 'workspace-specifier', field, 'fail', 'The workspace protocol has an invalid range or target.', 'workspace 协议的范围或目标无效。'))
        }
      }
      else if (!targets.length) {
        if (includes('workspace-target')) {
          checks.push(finding(entry, 'workspace-target', field, 'fail', 'The required workspace target was not discovered. Check its name, path and workspace patterns.', '未发现必需的 workspace 目标，请检查包名、路径及 workspace 匹配规则。'))
        }
      }
      else if (targets.length > 1) {
        if (includes('workspace-ambiguous')) {
          checks.push(finding(entry, 'workspace-ambiguous', field, 'fail', 'Multiple workspace packages match this dependency.', '此依赖匹配多个 workspace 包。'))
        }
      }
      else if (!targets[0]!.data) {
        if (includes('workspace-unreadable')) {
          checks.push(finding(entry, 'workspace-unreadable', field, 'warn', 'The workspace target exists but its manifest cannot be read.', 'workspace 目标存在，但无法读取其清单。'))
        }
      }
      else if (reference.range !== '*') {
        const version = targets[0]!.data!['version']
        if (typeof version !== 'string' || !valid(version)) {
          if (includes('workspace-version-unknown')) {
            checks.push(finding(entry, 'workspace-version-unknown', field, 'warn', 'The target has no valid version to compare with this explicit workspace range.', '目标没有有效版本，无法核对显式 workspace 范围。'))
          }
        }
        else if (!satisfies(version, reference.range)) {
          if (includes('workspace-version-mismatch')) {
            checks.push(finding(entry, 'workspace-version-mismatch', field, 'fail', 'The workspace target version does not satisfy this explicit dependency range.', 'workspace 目标版本不满足此显式依赖范围。'))
          }
        }
      }
    }
  }
  if (!includes('dependency-conflict') && !includes('dependency-duplicate')) {
    return checks
  }
  for (const [name, items] of declarations) {
    // peer/dev and peer/runtime combinations have separate purposes. Range
    // compatibility is covered by deps peers, not by duplicate-field rules.
    const concrete = items.filter(item => item.section !== 'peerDependencies')
    if (concrete.length < 2) {
      continue
    }
    const optionalOverride = concrete.length === 2 && concrete.some(item => item.section === 'dependencies') && concrete.some(item => item.section === 'optionalDependencies')
    const parsed = concrete.map(item => parseSpecifier(name, item.specifier))
    const known = parsed.every(item => item.source && item.range)
    const conflict = !optionalOverride && known && (new Set(parsed.map(item => item.source)).size > 1 || rangesOverlap(parsed.map(item => item.range!)) === false)
    if (!includes(conflict ? 'dependency-conflict' : 'dependency-duplicate')) {
      continue
    }
    checks.push(finding(entry, conflict ? 'dependency-conflict' : 'dependency-duplicate', `${concrete.map(item => item.section).join(',')}.${name}`, conflict ? 'fail' : 'warn', optionalOverride
      ? 'optionalDependencies overrides dependencies for this name. Review whether both declarations are intentional.'
      : conflict ? 'The dependency has conflicting declarations across dependency sections.' : 'The dependency is repeated across concrete dependency sections.', optionalOverride
      ? 'optionalDependencies 会覆盖 dependencies 中同名声明，请确认两处声明均有必要。'
      : conflict ? '此依赖在多个依赖分区中声明了冲突版本。' : '此依赖在多个具体依赖分区中重复声明。'))
  }
  return checks
}
