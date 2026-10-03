import type { DoctorCheck, DoctorContext } from '../doctor/types'
import type { TemplateDriftCollection } from './types'
import { collectTemplateDrift } from './collector'

export const templateDriftRuleIds = [
  'template-version-evidence',
  'template-instance-registry',
  'template-instance-baseline',
  'template-instance-version',
  'template-instance-drift',
  'root-asset-registry',
  'root-asset-version',
  'root-asset-drift',
] as const

export function templateDriftChecks(report: TemplateDriftCollection): DoctorCheck[] {
  const checks: DoctorCheck[] = [{
    id: 'template-version-evidence',
    title: 'Template package comparison evidence',
    status: report.evidence.status === 'available' ? 'pass' : 'warn',
    detail: report.evidence.detail,
    ...(report.evidence.status === 'unavailable' ? { fix: 'Supply an extracted template package or retry an explicitly enabled remote lookup.' } : {}),
  }]
  for (const [id, registry] of [['template-instance-registry', report.instanceRegistry], ['root-asset-registry', report.rootRegistry]] as const) {
    checks.push({ id, title: 'Managed template baseline registry', status: registry.status === 'unavailable' ? 'warn' : 'pass', path: registry.path, detail: `${registry.status}: ${registry.detail}`, ...(registry.status === 'unavailable' ? { fix: 'Restore trustworthy metadata before checking managed file drift.' } : {}) })
  }
  for (const owner of report.owners) {
    const prefix = owner.kind === 'instance' ? 'template-instance' : 'root-asset'
    if (owner.kind === 'instance') {
      checks.push({ id: `${prefix}-baseline`, title: 'Template instance baseline', path: owner.path, status: owner.baseline.status === 'available' ? 'pass' : 'warn', detail: `${owner.baseline.status}: ${owner.baseline.detail}`, ...(owner.baseline.status !== 'available' ? { fix: owner.recommendations.join(' ') } : {}) })
    }
    checks.push({ id: `${prefix}-version`, title: 'Retained template package version', path: owner.path, status: ['newer', 'unknown'].includes(owner.version.status) ? 'warn' : 'pass', detail: owner.version.detail, ...(['newer', 'unknown'].includes(owner.version.status) ? { fix: owner.recommendations.join(' ') || 'Obtain verified source version evidence before claiming the template is current.' } : {}) })
    for (const file of owner.files) {
      const status = ['modified', 'deleted', 'unavailable'].includes(file.state) ? 'warn' : 'pass'
      checks.push({ id: `${prefix}-drift`, title: 'Managed template path', path: file.path, status, detail: `${file.state}${file.detail ? `: ${file.detail}` : ''}`, ...(status === 'warn' ? { fix: owner.recommendations.join(' ') } : {}) })
    }
  }
  return checks
}

export async function collectTemplateDriftChecks(context: DoctorContext, selected: ReadonlySet<string>) {
  return templateDriftChecks(await collectTemplateDrift(context.workspaceDir)).filter(check => selected.has(check.id))
}
