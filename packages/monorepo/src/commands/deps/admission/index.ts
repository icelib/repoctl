import type { DependencyAdmissionOptions, DependencyAdmissionReport } from './types'
import { admissionPolicyHash, readAdmissionBaseline } from './baseline'
import { loadAdmissionConfig, parseAdmissionConfig } from './config'
import { evaluateAdmission } from './evaluate'
import { scanAdmission } from './scan'

export type * from './types'

/** Offline inspection of third-party direct declarations; never changes manifests or lockfiles. */
export async function checkDependencyAdmission(cwd: string, options: DependencyAdmissionOptions = {}): Promise<DependencyAdmissionReport> {
  const now = options.now ?? new Date()
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('Dependency policy checks require a valid evaluation date.')
  }
  const scan = await scanAdmission(cwd).catch(() => {
    throw new Error('Cannot read workspace manifests or catalogs for dependency admission. Validate pnpm-workspace.yaml and package.json files before retrying.')
  })
  const config = options.config === undefined ? (await loadAdmissionConfig(scan.workspaceDir)).config : parseAdmissionConfig(options.config)
  const policyHash = admissionPolicyHash(config)
  const added = !options.full && options.baseline !== undefined
  const baseline = added ? readAdmissionBaseline(options.baseline, policyHash) : new Set<string>()
  const report: DependencyAdmissionReport = {
    schemaVersion: 1,
    kind: 'dependency-admission',
    workspaceDir: scan.workspaceDir,
    policyHash,
    mode: added ? 'added' : 'full',
    declarations: scan.declarations.map(item => item.declaration),
    skipped: scan.skipped,
    findings: [],
    exceptions: [],
    summary: { fail: 0, warn: 0, existing: 0, waived: 0 },
  }
  evaluateAdmission(scan.declarations, scan.nodes, config, report, now)
  for (const finding of report.findings) {
    if (baseline.has(finding.key)) {
      finding.baseline = 'existing'
      report.summary.existing++
    }
    else {
      report.summary[finding.status]++
    }
  }
  report.summary.waived = report.exceptions.length
  return report
}
