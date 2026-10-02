import type { DoctorReport } from './types'
import { collectDoctorContext } from './context'
import { summarizeChecks } from './helpers'
import { collectReleaseChecks } from './release'
import { collectToolingChecks } from './tooling'
import { collectUpgradeChecks } from './upgrade'
import { collectWorkspaceChecks } from './workspace'

export type { DoctorCheck, DoctorReport, DoctorStatus, DoctorSummary } from './types'

export async function runDoctor(cwd: string) {
  const context = await collectDoctorContext(cwd)
  const checks = [
    ...collectWorkspaceChecks(context),
    ...await collectToolingChecks(context),
    ...await collectReleaseChecks(context.workspaceDir, context.packageJson),
    ...await collectUpgradeChecks(context.workspaceDir),
  ]
  return {
    cwd,
    workspaceDir: context.workspaceDir,
    packageCount: context.packageCount,
    checks,
    summary: summarizeChecks(checks),
  } satisfies DoctorReport
}
