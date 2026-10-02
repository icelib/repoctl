import type { DoctorCheck } from './types'
import { checkDependencyAdmission } from '../deps/admission'
import { loadAdmissionConfig } from '../deps/admission/config'

export async function collectAdmissionChecks(workspaceDir: string): Promise<DoctorCheck[]> {
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
      detail: `${item.rule}: ${item.declaration ? `${item.declaration.path} ${item.declaration.section}.${item.declaration.name}: ` : ''}${item.detail}${item.reason ? ` ${item.reason}` : ''}${item.alternative ? ` Alternative: ${item.alternative}` : ''}`,
    }))
    if (report.exceptions.length) {
      checks.push({ id: 'admission-exceptions', status: 'pass', title, detail: report.exceptions.map(item => `${item.rule}: ${item.workspace} ${item.section}.${item.dependency}: ${item.reason}`).join('\n') })
    }
    return checks.length ? checks : [{ id: 'admission-policy', status: 'pass', title, detail: 'No violations in the configured third-party direct dependency policy.' }]
  }
  catch {
    return [{ id: 'admission-config', status: 'fail', title, detail: 'Cannot inspect dependency admission. Run deps policy to review configuration or manifest diagnostics.' }]
  }
}
