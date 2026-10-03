import type { DoctorCheck } from '../types'
import type { InstallSecuritySources } from './sources'
import type { InstallPolicyKey, InstallSecurityReport, InstallSecuritySetting } from './types'
import { gte } from 'semver'
import { record } from '../../deps/files'
import { defaultSetting, legacyBuildKeys, policyKeys, selectorIdentity, selectorSyntaxSupported, settingState, supportedVersion, validPolicyValue } from './settings'

export const installSecurityRuleIds = ['install-security-version', 'install-security-release-age', 'install-security-trust', 'install-security-builds', 'install-security-compatibility', 'install-security-config', 'install-security-expectation', 'install-security-exception'] as const

export function evaluateSecurity(source: InstallSecuritySources, selected?: ReadonlySet<string>) {
  const checks: DoctorCheck[] = []
  const add = (id: string, status: DoctorCheck['status'], detail: string) => {
    if (!selected || selected.has(id)) {
      checks.push({ id, status, title: 'pnpm installation security policy', detail })
    }
  }
  const settings: InstallSecuritySetting[] = []
  const values = new Map<InstallPolicyKey, unknown>()
  for (const key of policyKeys) {
    const configured = source.values.get(key)
    let state: InstallSecuritySetting['state'] = source.uncertain.has(key) ? 'unknown' as const : settingState(key, source.version)
    const value = configured ? configured.value : state === 'active' ? defaultSetting(key, source.version!, source.values.has('minimumReleaseAge')) : null
    if (configured && state === 'active' && !validPolicyValue(key, value)) {
      state = 'invalid'
      add('install-security-config', 'fail', `Invalid ${key} in ${configured.source}; its raw value is omitted.`)
    }
    if (configured && state === 'active' && !selectorSyntaxSupported(key, value, source.version!)) {
      state = 'unsupported'
    }
    if (state === 'active') {
      values.set(key, value)
    }
    const publicValue = state !== 'active'
      ? null
      : key === 'allowBuilds'
        ? null
        : key === 'onlyBuiltDependenciesFile'
          ? value ? 'external allowlist (not inspected)' : null
          : Array.isArray(value)
            ? value.map(item => selectorIdentity(item)?.package).filter((item): item is string => !!item)
            : typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' ? value : null
    settings.push({ key, source: configured?.source ?? 'pnpm default', configured: !!configured, state, value: publicValue })
    if (configured && state !== 'active' && state !== 'invalid') {
      add('install-security-compatibility', 'warn', `${key} in ${configured.source} is ${state} for the audited pnpm version. No setting was migrated.`)
    }
  }
  add('install-security-version', supportedVersion(source.version) && source.evidence !== 'declared' ? 'pass' : 'warn', source.version ? `Audited pnpm ${source.version}; version evidence: ${source.evidence}. No pnpm launcher was executed.` : 'The pnpm version is unknown; defaults cannot be established.')
  for (const inactive of source.inactive) {
    add('install-security-compatibility', 'warn', `${inactive.key} from ${inactive.source} is not read by this pnpm version.`)
  }
  const age = values.get('minimumReleaseAge')
  const strictAge = values.get('minimumReleaseAgeStrict')
  add('install-security-release-age', age === undefined ? 'warn' : 'pass', age === undefined
    ? 'The effective minimum release age is unknown or unsupported.'
    : `minimumReleaseAge: ${age} minute(s), ${source.values.has('minimumReleaseAge') ? 'explicitly configured' : 'pnpm default'}; ${age === 0 ? 'release waiting is disabled' : strictAge === false ? 'pnpm may fall back to younger versions' : 'versions younger than the configured age are rejected'}. Exceptions are reported by package name.`)
  const trust = values.get('trustPolicy')
  add('install-security-trust', trust === undefined ? 'warn' : 'pass', trust === undefined
    ? 'The effective trust policy is unknown or unsupported.'
    : `trustPolicy: ${trust}; minimumReleaseAgeIgnoreMissingTime: ${values.get('minimumReleaseAgeIgnoreMissingTime') ?? 'unsupported'}; trustPolicyIgnoreAfter: ${values.get('trustPolicyIgnoreAfter') ?? 'unset'} minute(s); trustLockfile: ${values.get('trustLockfile') ?? 'unsupported'}. Off, exclusions, age cutoffs and trusted lockfiles reduce the checked scope.`)
  const builds: InstallSecurityReport['builds'] = { decisions: [], pendingPackages: [], override: 'none', default: 'unreviewed' }
  const modern = source.version !== null && gte(source.version, '11.0.0')
  const allowBuilds = record(values.get('allowBuilds'))
  if (allowBuilds) {
    for (const [selector, decision] of Object.entries(allowBuilds)) {
      const identity = selectorIdentity(selector)!
      builds.decisions.push({ package: identity.package, selector: identity.selector!, decision: decision === true ? 'allow' : decision === false ? 'deny' : 'pending', source: source.values.get('allowBuilds')!.source })
    }
  }
  if (!modern && !allowBuilds) {
    for (const key of ['onlyBuiltDependencies', 'neverBuiltDependencies', 'ignoredBuiltDependencies'] as const) {
      const entries = values.get(key)
      if (Array.isArray(entries)) {
        for (const selector of entries) {
          const identity = selectorIdentity(selector)!
          builds.decisions.push({ package: identity.package, selector: identity.selector!, decision: key === 'onlyBuiltDependencies' ? 'allow' : 'deny', source: source.values.get(key)!.source })
        }
      }
    }
    if (Array.isArray(values.get('neverBuiltDependencies')) && !source.values.has('onlyBuiltDependencies') && !source.values.has('onlyBuiltDependenciesFile')) {
      builds.default = 'allowed'
    }
    if (values.get('onlyBuiltDependenciesFile')) {
      builds.default = 'unknown'
      add('install-security-builds', 'warn', 'onlyBuiltDependenciesFile can add permissions. The external allowlist is not loaded; build policy is incomplete.')
    }
  }
  if (!modern && allowBuilds && legacyBuildKeys.some(key => source.values.has(key))) {
    add('install-security-compatibility', 'warn', 'allowBuilds coexists with historical build settings. Review the pnpm 10 configuration conflict before installation; no automatic migration was performed.')
    builds.default = 'unknown'
  }
  if (values.get('dangerouslyAllowAllBuilds') === true) {
    builds.default = 'allowed'
    builds.override = 'allow-all'
    if (source.values.has('allowBuilds') || legacyBuildKeys.some(key => source.values.has(key))) {
      builds.default = 'unknown'
      builds.override = 'conflict'
      add('install-security-compatibility', 'warn', 'An allow-all override coexists with package build decisions; pnpm may reject this combination. Effective build permissions are unknown.')
    }
  }
  if (values.get('ignoreScripts') === true || values.get('ignoreDepScripts') === true) {
    if (builds.override !== 'conflict') {
      builds.default = 'blocked'
      builds.override = 'ignore-scripts'
    }
  }
  if (!source.version || settings.some(item => ['allowBuilds', 'ignoreScripts', 'dangerouslyAllowAllBuilds'].includes(item.key) && ['invalid', 'unknown'].includes(item.state))) {
    builds.default = 'unknown'
    builds.override = 'unknown'
  }
  const pending = Array.isArray(source.modules['pendingBuilds']) ? source.modules['pendingBuilds'] : []
  builds.pendingPackages = [...new Set(pending.flatMap(value => typeof value === 'string' && value !== '.' ? [selectorIdentity(value.replace(/\(.*$/u, ''))?.package].filter((item): item is string => !!item) : []))].sort()
  builds.decisions.sort((a, b) => a.package.localeCompare(b.package) || a.selector.localeCompare(b.selector))
  add('install-security-builds', builds.default === 'unknown' ? 'warn' : 'pass', `Unlisted dependency builds: ${builds.default}; strictDepBuilds: ${values.get('strictDepBuilds') ?? 'unsupported'}. Global build override: ${builds.override}. Explicit allow, deny and pending decisions describe configured declarations; overrides may prevent or bypass them. Installation pendingBuilds means not yet built, not necessarily unapproved. ignoreScripts does not disable pnpmfile hooks.`)
  return { checks, settings, builds, values, add, version: source.version }
}
