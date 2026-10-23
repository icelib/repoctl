import type { DoctorCheck } from '../../../../commands/doctor'

export interface DoctorCheckGroup {
  check: DoctorCheck
  paths: string[]
  count: number
}

/** Group presentation only; preserve every check occurrence and the report's original counts. */
export function groupDoctorChecks(checks: DoctorCheck[]): DoctorCheckGroup[] {
  const groups: DoctorCheckGroup[] = []
  const indexed = new Map<string, DoctorCheckGroup>()
  for (const check of checks) {
    const suppression = check.suppression
    const key = JSON.stringify([
      check.id,
      check.status,
      check.title,
      check.detail,
      check.fix,
      check.field,
      suppression && [suppression.id, suppression.state, suppression.reason, suppression.expires, suppression.path],
    ])
    // A pathless result has no file identity; keep it individually visible.
    const existing = check.path === undefined ? undefined : indexed.get(key)
    if (existing) {
      existing.paths.push(check.path!)
      existing.count++
    }
    else {
      const group = { check, paths: check.path === undefined ? [] : [check.path], count: 1 }
      groups.push(group)
      if (check.path !== undefined) {
        indexed.set(key, group)
      }
    }
  }
  return groups
}
