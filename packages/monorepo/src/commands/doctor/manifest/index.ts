import type { DoctorCheck, DoctorContext } from '../types'
import { localize } from '../../../i18n'
import { dependencyChecks } from './dependencies'
import { finding } from './finding'
import { metadataChecks } from './metadata'

export function collectManifestChecks(context: DoctorContext): DoctorCheck[] {
  const checks: DoctorCheck[] = []
  for (const entry of context.manifests) {
    if (entry.error) {
      checks.push(finding(entry, entry.error === 'multiple_manifests' ? 'multiple' : 'parse', '$', 'fail', entry.error === 'multiple_manifests'
        ? 'Multiple package manifests exist in this directory; keep one authoritative manifest.'
        : 'The package manifest is unreadable or is not a valid object. Other packages are still checked.', entry.error === 'multiple_manifests'
        ? '此目录存在多个包清单，请保留一个权威清单。'
        : '包清单无法读取或不是有效对象；仍会继续检查其他包。'))
    }
    if (!entry.data) {
      continue
    }
    checks.push(...metadataChecks(entry, context.workspaceDir), ...dependencyChecks(entry, context.manifests))
    const name = entry.data['name']
    if (typeof name === 'string' && context.manifests.filter(item => item.data?.['name'] === name).length > 1) {
      checks.push(finding(entry, 'name-duplicate', 'name', 'fail', 'This name is used by another workspace package, including the root.', '此名称与另一个 workspace 包（包含根包）重复。'))
    }
  }
  if (context.workspaceManifestError) {
    checks.push({ id: 'manifest-workspace-parse', path: 'pnpm-workspace.yaml', field: 'packages', title: 'pnpm-workspace.yaml — packages', status: 'fail', detail: localize('Workspace patterns could not be read; package discovery is incomplete.', '无法读取 workspace 匹配规则；包发现不完整。') })
  }
  return checks.length
    ? checks.sort((a, b) => `${a.path}\0${a.field}\0${a.id}`.localeCompare(`${b.path}\0${b.field}\0${b.id}`))
    : [{
        id: 'manifest-health',
        title: localize('Workspace manifest health', 'Workspace 包清单健康'),
        status: 'pass',
        detail: localize(`Static manifest checks passed for ${context.manifests.length} package(s).`, `${context.manifests.length} 个包通过静态清单检查。`),
      }]
}
