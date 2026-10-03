import type { TemplateDriftOptions, TemplateDriftReport } from './types'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { loadMonorepoConfigDetails } from '../../core/config'
import { summarizeChecks } from '../doctor/helpers'
import { validateDoctorConfiguration } from '../doctor/settings'
import { applyDoctorSuppressions, validateDoctorSuppressions } from '../doctor/suppressions'
import { templateDriftChecks } from './checks'
import { collectTemplateDrift } from './collector'

export { formatTemplateDriftReport, hasTemplateDriftIssues } from './report'
export type { TemplateDriftCollection, TemplateDriftFile, TemplateDriftOptions, TemplateDriftOwner, TemplateDriftRegistry, TemplateDriftReport, TemplateVersionComparison, TemplateVersionEvidence } from './types'

export async function checkTemplateDrift(cwd: string, options: TemplateDriftOptions = {}): Promise<TemplateDriftReport> {
  const collection = await collectTemplateDrift(await findWorkspaceDir(cwd) ?? cwd, options)
  const { config, rawLayers } = await loadMonorepoConfigDetails(collection.workspaceDir, { refresh: true })
  for (const layer of rawLayers) {
    validateDoctorConfiguration(layer.commands?.doctor)
  }
  const suppressions = validateDoctorSuppressions(options.suppressions === undefined ? config.commands?.doctor?.suppressions : options.suppressions)
  const checks = templateDriftChecks(collection)
  const reports = applyDoctorSuppressions(checks, suppressions)
  return { ...collection, checks, summary: summarizeChecks(checks), rawSummary: summarizeChecks(checks, true), suppressions: reports }
}
