import type { DoctorSuppression } from '../../types/doctor'
import type { DoctorCheck, DoctorSuppressionReport } from './types'
import { getDoctorRuleIds } from './rules'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateDoctorSuppressions(value: unknown): DoctorSuppression[] {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new TypeError('doctor.suppressions must be an array.')
  }
  const ids = getDoctorRuleIds()
  const seen = new Set<string>()
  return value.map((item) => {
    if (!isRecord(item) || typeof item['id'] !== 'string' || !ids.includes(item['id'])) {
      throw new Error(`Unknown doctor suppression ID. Available: ${ids.join(', ')}`)
    }
    if (Object.keys(item).some(key => !['id', 'reason', 'expires', 'path'].includes(key))) {
      throw new Error(`Unknown doctor suppression field for ${item['id']}. Use id, reason, expires, and path.`)
    }
    if (typeof item['reason'] !== 'string' || !item['reason'].trim()) {
      throw new Error(`Doctor suppression ${item['id']} requires a nonempty reason.`)
    }
    const expires = item['expires']
    if (expires !== undefined && (typeof expires !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expires) || Number.isNaN(Date.parse(expires)) || new Date(expires).toISOString().slice(0, 10) !== expires)) {
      throw new Error(`Doctor suppression ${item['id']} requires a valid YYYY-MM-DD expiry.`)
    }
    const path = item['path']
    if (path !== undefined && (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..') || /^[a-z]:/i.test(path))) {
      throw new Error(`Doctor suppression ${item['id']} requires a workspace-relative path.`)
    }
    const key = `${item['id']}\0${path ?? ''}`
    if (seen.has(key)) {
      throw new Error(`Duplicate doctor suppression: ${item['id']}.`)
    }
    seen.add(key)
    return { id: item['id'], reason: item['reason'].trim(), ...(typeof expires === 'string' ? { expires } : {}), ...(typeof path === 'string' ? { path } : {}) }
  })
}

export function applyDoctorSuppressions(checks: DoctorCheck[], suppressions: DoctorSuppression[], now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  const reports: DoctorSuppressionReport[] = suppressions.map(suppression => ({
    ...suppression,
    state: suppression.expires && suppression.expires < today ? 'expired' : 'active',
    matched: checks.filter(check => check.status !== 'pass' && check.id === suppression.id && (suppression.path === undefined || check.path === suppression.path)).length,
  }))
  for (const check of checks) {
    if (check.status === 'pass') {
      continue
    }
    const matches = reports.filter(item => item.id === check.id && (item.path === undefined || item.path === check.path))
    const match = matches.find(item => item.state === 'active') ?? matches[0]
    if (match) {
      const { matched: _, ...suppression } = match
      check.suppression = suppression
    }
  }
  return reports
}
