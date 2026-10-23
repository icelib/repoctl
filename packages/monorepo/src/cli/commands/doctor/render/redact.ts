import type { DoctorReport } from '../../../../commands/doctor'
import os from 'node:os'

function replaceAll(value: string, search: string, replacement: string) {
  return search.length > 0 ? value.split(search).join(replacement) : value
}

function redactDoctorReportValue(value: unknown, replacements: Array<[string, string]>): unknown {
  if (typeof value === 'string') {
    return replacements.reduce((result, [search, replacement]) => replaceAll(result, search, replacement), value)
  }
  if (Array.isArray(value)) {
    return value.map(item => redactDoctorReportValue(item, replacements))
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactDoctorReportValue(item, replacements)]),
    )
  }
  return value
}

export function redactDoctorReport(report: DoctorReport): DoctorReport {
  const candidates: Array<[string, string]> = [
    [report.workspaceDir, '<workspace>'],
    [report.cwd, '<cwd>'],
    [os.homedir(), '<home>'],
  ]
  const replacements = candidates
    .filter(([search], index, entries) => search.length > 0 && entries.findIndex(([value]) => value === search) === index)
    .sort(([left], [right]) => right.length - left.length)

  return redactDoctorReportValue(report, replacements) as DoctorReport
}
