import type { DoctorCheck } from './types'
import { checkWorkspaceBoundaries } from '../../core/workspace-boundaries'
import { loadBoundaryConfiguration } from '../../core/workspace-boundaries/project'
import { localize } from '../../i18n'

/** Architecture policy is opt-in for existing doctor callers. */
export async function collectBoundaryChecks(workspaceDir: string, selected?: ReadonlySet<string>): Promise<DoctorCheck[]> {
  const title = localize('Workspace architecture boundaries', '工作区架构边界')
  try {
    const { config, configured } = await loadBoundaryConfiguration(workspaceDir)
    if (!configured) {
      return []
    }
    const report = await checkWorkspaceBoundaries(workspaceDir, { config })
    const checks: DoctorCheck[] = report.findings.map(finding => ({
      id: finding.id,
      title,
      status: finding.status,
      detail: `${finding.field ? `${finding.field}: ` : ''}${finding.detail}`,
      ...(finding.path ? { path: finding.path } : {}),
      ...(finding.field ? { field: finding.field } : {}),
    }))
    if (report.exceptions.length) {
      checks.push({ id: 'boundary-exceptions', title, status: 'pass', detail: report.exceptions.map(item => `${item.rule}: ${item.source} -> ${item.target} (${item.type}): ${item.reason}`).join('\n') })
    }
    if (!checks.length || (selected?.has('boundary-policy') && checks.some(check => !selected.has(check.id)))) {
      checks.push({ id: 'boundary-policy', title, status: report.summary.fail ? 'fail' : report.summary.warn ? 'warn' : 'pass', detail: report.findings.length ? report.findings.map(finding => finding.detail).join('\n') : 'No violations in the configured internal manifest dependency policy.' })
    }
    // Configuration/graph failures prevent the requested rules from being evaluated.
    return selected ? checks.filter(check => selected.has(check.id) || check.id === 'boundary-config' || check.id === 'boundary-graph') : checks
  }
  catch {
    return [{ id: 'boundary-config', title, status: 'fail', detail: 'Unable to inspect workspace boundaries; check configuration and workspace manifests.' }]
  }
}
