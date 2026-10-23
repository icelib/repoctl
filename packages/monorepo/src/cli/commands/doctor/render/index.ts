import type { DoctorReport } from '../../../../commands/doctor'
import { formatDoctorMarkdown } from './markdown'
import { redactDoctorReport } from './redact'
import { formatDoctorText } from './text'

interface DoctorOutputOptions {
  json?: boolean
  markdown?: boolean
  redact?: boolean
  strict?: boolean
}

export function createDoctorReportOutput(report: DoctorReport, opts: DoctorOutputOptions) {
  const outputReport = opts.redact ? redactDoctorReport(report) : report
  if (opts.json) {
    return JSON.stringify(outputReport, null, 2)
  }
  return opts.markdown ? formatDoctorMarkdown(outputReport) : formatDoctorText(outputReport)
}

export function createInteractiveDoctorReportOutput(report: DoctorReport, opts: DoctorOutputOptions) {
  return formatDoctorText(opts.redact ? redactDoctorReport(report) : report, true)
}

export function hasDoctorBlockingIssues(report: DoctorReport, opts: DoctorOutputOptions) {
  return report.summary.fail > 0 || (opts.strict === true && report.summary.warn > 0)
}
