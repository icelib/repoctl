import type { DoctorOptions } from '../../types/doctor'
import type { DoctorReport } from './types'
import { loadMonorepoConfigDetails } from '../../core/config'
import { collectDoctorContext } from './context'
import { summarizeChecks } from './helpers'
import { collectSelectedDoctorChecks, selectDoctorRules } from './rules'
import { validateDoctorConfiguration } from './settings'
import { applyDoctorSuppressions, validateDoctorSuppressions } from './suppressions'

export { applyDoctorFixPlan, planDoctorFix } from './fix'
export type { DoctorFixPlan, DoctorFixResult } from './fix/types'
export { getDoctorRuleIds } from './rules'
export type { DoctorCheck, DoctorReport, DoctorStatus, DoctorSummary, DoctorSuppressionReport } from './types'

export async function runDoctor(cwd: string, options: DoctorOptions = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Doctor options must be an object.')
  }
  // Validate explicit IDs before discovery or user configuration executes.
  if (options.rules !== undefined) {
    selectDoctorRules(options.rules)
  }
  const context = await collectDoctorContext(cwd)
  const { config, rawLayers } = await loadMonorepoConfigDetails(context.workspaceDir, { refresh: true })
  for (const layer of rawLayers) {
    validateDoctorConfiguration(layer.commands?.doctor)
  }
  const settings = config.commands?.doctor
  if (settings !== undefined && (!settings || typeof settings !== 'object' || Array.isArray(settings))) {
    throw new Error('commands.doctor must be an object.')
  }
  const selected = selectDoctorRules(options.rules === undefined ? settings?.rules : options.rules)
  const suppressions = validateDoctorSuppressions(options.suppressions === undefined ? settings?.suppressions : options.suppressions)
  const checks = await collectSelectedDoctorChecks(context, selected)
  const suppressionReports = applyDoctorSuppressions(checks, suppressions)
  return {
    cwd,
    workspaceDir: context.workspaceDir,
    packageCount: context.packageCount,
    checks,
    summary: summarizeChecks(checks),
    ...(suppressionReports.length ? { rawSummary: summarizeChecks(checks, true), suppressions: suppressionReports } : {}),
  } satisfies DoctorReport
}
