import type { DoctorCheck, DoctorContext } from './types'
import { collectAdmissionChecks } from './admission'
import { collectBoundaryChecks } from './boundaries'
import { collectInstallationChecks } from './installation'
import { collectManifestChecks } from './manifest'
import { collectReleaseChecks } from './release'
import { checkNodeVersion, checkNodeVersionFiles } from './runtime/node'
import { collectPnpmChecks } from './runtime/pnpm'
import { collectInstallSecurityChecks, installSecurityRuleIds } from './security'
import { collectToolingChecks } from './tooling'
import { collectWorkspaceChecks } from './workspace'

interface DoctorCollector {
  ids: readonly string[]
  collect: (context: DoctorContext, selected: ReadonlySet<string>) => DoctorCheck[] | Promise<DoctorCheck[]>
}

const manifestIds = [
  'multiple',
  'parse',
  'name-missing',
  'name-invalid',
  'name-legacy',
  'private-invalid',
  'version-invalid',
  'version-missing',
  'license',
  'repository',
  'repository-directory',
  'publish-config',
  'publish-access',
  'publish-registry',
  'name-duplicate',
  'dependency-section',
  'dependency-specifier',
  'self-dependency',
  'workspace-specifier',
  'workspace-target',
  'workspace-ambiguous',
  'workspace-unreadable',
  'workspace-version-unknown',
  'workspace-version-mismatch',
  'dependency-conflict',
  'dependency-duplicate',
  'workspace-parse',
  'health',
].map(id => `manifest-${id}`)

const collectors: DoctorCollector[] = [
  { ids: ['package-json', 'workspace-manifest', 'config-file', 'commit-hooks', 'workspace-patterns', 'workspace-package-coverage'], collect: collectWorkspaceChecks },
  { ids: manifestIds, collect: collectManifestChecks },
  { ids: ['boundary-rule', 'boundary-cycle', 'boundary-config', 'boundary-selector-unmatched', 'boundary-graph', 'boundary-exception-unused', 'boundary-exceptions', 'boundary-policy'], collect: (context, selected) => collectBoundaryChecks(context.workspaceDir, selected) },
  { ids: ['admission-denied', 'admission-not-allowed', 'admission-conflict', 'admission-resolution', 'admission-unused-exception', 'admission-expired-exception', 'admission-expiring-exception', 'admission-selector-unmatched', 'admission-exceptions', 'admission-policy', 'admission-config'], collect: (context, selected) => collectAdmissionChecks(context.workspaceDir, selected) },
  { ids: ['node-version'], collect: context => [checkNodeVersion(context)] },
  { ids: ['node-version-files'], collect: async context => [await checkNodeVersionFiles(context)] },
  { ids: ['package-manager', 'pnpm-version'], collect: collectPnpmChecks },
  { ids: ['lockfile-sync', 'installation-state'], collect: collectInstallationChecks },
  { ids: installSecurityRuleIds, collect: collectInstallSecurityChecks },
  { ids: ['tool-package', 'root-scripts', 'tooling-imports'], collect: collectToolingChecks },
  { ids: ['release-workflow', 'release-prerelease-state', 'release-changeset-config', 'release-cli-version', 'release-versioning-config'], collect: (context, selected) => collectReleaseChecks(context.workspaceDir, context.packageJson, selected) },
]

/** Stable IDs shared by config, CLI, and report consumers. */
export function getDoctorRuleIds(): string[] {
  return collectors.flatMap(collector => collector.ids)
}

export function selectDoctorRules(rules: unknown): ReadonlySet<string> {
  const available = getDoctorRuleIds()
  if (rules === undefined) {
    return new Set(available)
  }
  if (!Array.isArray(rules) || rules.some(id => typeof id !== 'string' || !available.includes(id))) {
    throw new Error(`Unknown or invalid doctor rules. Available: ${available.join(', ')}`)
  }
  return new Set(rules)
}

export async function collectSelectedDoctorChecks(context: DoctorContext, selected: ReadonlySet<string>) {
  const checks: DoctorCheck[] = []
  for (const collector of collectors) {
    if (collector.ids.some(id => selected.has(id))) {
      checks.push(...await collector.collect(context, selected))
    }
  }
  return checks
}
