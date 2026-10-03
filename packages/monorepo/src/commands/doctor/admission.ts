import type { DoctorCheck } from './types'
import { checkDependencyAdmission } from '../deps/admission'
import { loadAdmissionConfig } from '../deps/admission/config'

export async function collectAdmissionChecks(workspaceDir: string, selected?: ReadonlySet<string>): Promise<DoctorCheck[]> {
  const title = 'Third-party dependency admission'
  try {
    const { config, configured } = await loadAdmissionConfig(workspaceDir)
    if (!configured) {
      return []
    }
    const report = await checkDependencyAdmission(workspaceDir, { config })
    const checks: DoctorCheck[] = report.findings.map(item => ({
      id: item.id,
      title,
      status: item.status,
      ...(item.declaration ? { path: item.declaration.path, field: `${item.declaration.section}.${item.declaration.name}` } : {}),
      detail: `${item.rule}: ${item.declaration ? `${item.declaration.path} ${item.declaration.section}.${item.declaration.name}: ` : ''}${item.detail}${item.reason ? ` ${item.reason}` : ''}${item.alternative ? ` Alternative: ${item.alternative}` : ''}`,
    }))
    if (report.exceptions.length) {
      checks.push({ id: 'admission-exceptions', status: 'pass', title, detail: report.exceptions.map(item => `${item.rule}: ${item.workspace} ${item.section}.${item.dependency}: ${item.reason}`).join('\n') })
    }
    if (!checks.length || (selected?.has('admission-policy') && checks.some(check => !selected.has(check.id)))) {
      checks.push({ id: 'admission-policy', title, status: report.summary.fail ? 'fail' : report.summary.warn ? 'warn' : 'pass', detail: report.findings.length ? report.findings.map(item => `${item.rule}: ${item.detail}`).join('\n') : 'No violations in the configured third-party direct dependency policy.' })
    }
    return selected ? checks.filter(check => selected.has(check.id) || check.id === 'admission-config') : checks
  }
  catch {
    return [{ id: 'admission-config', status: 'fail', title, detail: 'Cannot inspect dependency admission. Run deps policy to review configuration or manifest diagnostics.' }]
  }
}
