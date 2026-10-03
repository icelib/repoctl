import type { DoctorReport } from './types'
import { collectAdmissionChecks } from './admission'
import { collectBoundaryChecks } from './boundaries'
import { collectDoctorContext } from './context'
import { summarizeChecks } from './helpers'
import { collectInstallationChecks } from './installation'
import { collectManifestChecks } from './manifest'
import { collectReleaseChecks } from './release'
import { checkNodeVersion, checkNodeVersionFiles } from './runtime/node'
import { collectPnpmChecks } from './runtime/pnpm'
import { collectInstallSecurityChecks } from './security'
import { collectToolingChecks } from './tooling'
import { collectWorkspaceChecks } from './workspace'

export type { DoctorCheck, DoctorReport, DoctorStatus, DoctorSummary } from './types'

export async function runDoctor(cwd: string) {
  const context = await collectDoctorContext(cwd)
  const checks = [
    ...collectWorkspaceChecks(context),
    ...collectManifestChecks(context),
    ...await collectBoundaryChecks(context.workspaceDir),
    ...await collectAdmissionChecks(context.workspaceDir),
    checkNodeVersion(context),
    await checkNodeVersionFiles(context),
    ...await collectPnpmChecks(context),
    ...await collectInstallationChecks(context),
    ...await collectInstallSecurityChecks(context),
    ...await collectToolingChecks(context),
    ...await collectReleaseChecks(context.workspaceDir, context.packageJson),
  ]
  return {
    cwd,
    workspaceDir: context.workspaceDir,
    packageCount: context.packageCount,
    checks,
    summary: summarizeChecks(checks),
  } satisfies DoctorReport
}
