import type { DoctorCheck, DoctorSummary } from './types'
import { getWorkspaceManifestPatterns } from '../../core/workspace/manifest'

export function createCheck(check: DoctorCheck) {
  return check
}

export function summarizeChecks(checks: DoctorCheck[]): DoctorSummary {
  return checks.reduce<DoctorSummary>((summary, check) => {
    summary[check.status] += 1
    return summary
  }, {
    pass: 0,
    warn: 0,
    fail: 0,
  })
}

export function getWorkspacePatterns(manifest: unknown) {
  return getWorkspaceManifestPatterns(manifest) ?? ['**']
}

export { isWorkspacePackageCovered as isWorkspacePatternCovered } from '../../core/workspace/patterns'
