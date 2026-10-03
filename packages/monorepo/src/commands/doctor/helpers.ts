import type { DoctorCheck, DoctorSummary } from './types'

export function createCheck(check: DoctorCheck) {
  return check
}

export function summarizeChecks(checks: DoctorCheck[], includeSuppressed = false): DoctorSummary {
  return checks.reduce<DoctorSummary>((summary, check) => {
    if (includeSuppressed || check.suppression?.state !== 'active') {
      summary[check.status] += 1
    }
    return summary
  }, {
    pass: 0,
    warn: 0,
    fail: 0,
  })
}

export function getWorkspacePatterns(manifest: unknown) {
  if (typeof manifest !== 'object' || manifest === null) {
    return []
  }
  const packages = (manifest as { packages?: unknown }).packages
  return Array.isArray(packages)
    ? packages.filter((item): item is string => typeof item === 'string')
    : []
}

export function isWorkspacePatternCovered(relativeDir: string, patterns: string[]) {
  const normalized = relativeDir.split('\\').join('/')
  return patterns.some((pattern) => {
    if (pattern.startsWith('!')) {
      return false
    }
    if (pattern.endsWith('/*')) {
      const base = pattern.slice(0, -2)
      return normalized.startsWith(`${base}/`) && normalized.slice(base.length + 1).split('/').length === 1
    }
    if (pattern.endsWith('/**')) {
      return normalized.startsWith(`${pattern.slice(0, -3)}/`)
    }
    return normalized === pattern
  })
}
