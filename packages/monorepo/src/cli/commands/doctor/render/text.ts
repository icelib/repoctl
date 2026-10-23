import type { DoctorReport, DoctorStatus } from '../../../../commands/doctor'
import pc from 'picocolors'
import { localize } from '../../../../i18n'
import { groupDoctorChecks } from './groups'

function formatStatus(status: DoctorStatus) {
  return status === 'pass' ? pc.green('PASS') : status === 'warn' ? pc.yellow('WARN') : pc.red('FAIL')
}

export function formatDoctorText(report: DoctorReport, color = false) {
  const status = color ? formatStatus : (value: DoctorStatus) => value.toUpperCase()
  const lines = [
    localize(`workspace: ${report.workspaceDir}`, `工作区：${report.workspaceDir}`),
    localize(`packages: ${report.packageCount}`, `包数量：${report.packageCount}`),
    '',
  ]
  for (const { check, paths, count } of groupDoctorChecks(report.checks)) {
    const occurrences = count > 1 ? localize(` (${count} checks)`, `（${count} 项检查）`) : ''
    lines.push(`[${status(check.status)}] [${check.id}] ${check.title}${occurrences}`)
    for (const filename of paths) {
      lines.push(localize(`  path: ${filename}`, `  路径：${filename}`))
    }
    if (check.field !== undefined) {
      lines.push(localize(`  field: ${check.field}`, `  字段：${check.field}`))
    }
    lines.push(`  ${check.detail}`)
    if (check.suppression) {
      lines.push(`  suppression: ${check.suppression.state}; reason: ${check.suppression.reason}; expires: ${check.suppression.expires ?? 'never'}`)
    }
    if (check.fix) {
      lines.push(localize(`  fix: ${check.fix}`, `  修复：${check.fix}`))
    }
  }
  for (const item of report.suppressions ?? []) {
    lines.push(`suppression ${item.id}: ${item.state}; matched: ${item.matched}; reason: ${item.reason}; expires: ${item.expires ?? 'never'}`)
  }
  lines.push('')
  lines.push(color
    ? localize(`summary: ${pc.green(String(report.summary.pass))} pass, ${pc.yellow(String(report.summary.warn))} warn, ${pc.red(String(report.summary.fail))} fail`, `摘要：${pc.green(String(report.summary.pass))} 通过，${pc.yellow(String(report.summary.warn))} 警告，${pc.red(String(report.summary.fail))} 失败`)
    : localize(`summary: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`, `摘要：${report.summary.pass} 通过，${report.summary.warn} 警告，${report.summary.fail} 失败`))
  return lines.join('\n')
}
