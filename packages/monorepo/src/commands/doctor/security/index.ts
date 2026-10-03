import type { DoctorContext } from '../types'
import type { InstallSecurityOptions, InstallSecurityReport } from './types'
import { loadMonorepoConfigDetails } from '../../../core/config'
import { summarizeChecks } from '../helpers'
import { evaluateSecurity } from './evaluate'
import { evaluateExpectations, validateExpectations } from './expectations'
import { readSecuritySources } from './sources'

export { installSecurityRuleIds } from './evaluate'
export type * from './types'

export async function inspectInstallSecurity(cwd: string, options: InstallSecurityOptions = {}, selected?: ReadonlySet<string>): Promise<InstallSecurityReport> {
  const source = await readSecuritySources(cwd, options)
  const result = evaluateSecurity(source, selected)
  const loaded = options.expectations === undefined
    ? await loadMonorepoConfigDetails(source.workspaceDir, { refresh: true }).catch(() => {
        throw new Error('Cannot load installation security expectations; configuration details are omitted.')
      })
    : undefined
  for (const layer of loaded?.rawLayers ?? []) {
    if (Object.hasOwn(layer, 'installationSecurity')) {
      validateExpectations(layer.installationSecurity)
    }
  }
  const configured = options.expectations === undefined ? loaded?.config.installationSecurity : options.expectations
  if (configured !== undefined) {
    evaluateExpectations(result, validateExpectations(configured))
  }
  return {
    schemaVersion: 1,
    kind: 'install-security',
    workspaceDir: source.workspaceDir,
    pnpm: { version: source.version, evidence: source.evidence },
    settings: result.settings,
    builds: result.builds,
    checks: result.checks,
    summary: summarizeChecks(result.checks),
    limitations: source.limitations,
  }
}

export async function collectInstallSecurityChecks(context: DoctorContext, selected?: ReadonlySet<string>) {
  try {
    return (await inspectInstallSecurity(context.workspaceDir, {}, selected)).checks
  }
  catch {
    return [{ id: 'install-security-config', title: 'pnpm installation security policy', status: 'fail' as const, detail: 'Installation policy could not be inspected. Run doctor security to review its configuration; no scripts were executed.' }]
  }
}
