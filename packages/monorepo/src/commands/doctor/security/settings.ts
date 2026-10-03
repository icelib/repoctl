import type { InstallPolicyKey } from './types'
import { gte, lt, major, prerelease, validRange } from 'semver'

export const policyKeys: InstallPolicyKey[] = ['minimumReleaseAge', 'minimumReleaseAgeStrict', 'minimumReleaseAgeExclude', 'minimumReleaseAgeIgnoreMissingTime', 'trustPolicy', 'trustPolicyExclude', 'trustPolicyIgnoreAfter', 'trustLockfile', 'allowBuilds', 'onlyBuiltDependencies', 'onlyBuiltDependenciesFile', 'neverBuiltDependencies', 'ignoredBuiltDependencies', 'ignoreDepScripts', 'ignoreScripts', 'dangerouslyAllowAllBuilds', 'strictDepBuilds']
export const legacyBuildKeys: InstallPolicyKey[] = ['onlyBuiltDependencies', 'onlyBuiltDependenciesFile', 'neverBuiltDependencies', 'ignoredBuiltDependencies', 'ignoreDepScripts']
const since: Partial<Record<InstallPolicyKey, string>> = { minimumReleaseAge: '10.16.0', minimumReleaseAgeExclude: '10.16.0', minimumReleaseAgeStrict: '11.0.0', minimumReleaseAgeIgnoreMissingTime: '11.0.0', trustPolicy: '10.21.0', trustPolicyExclude: '10.22.0', trustPolicyIgnoreAfter: '10.27.0', trustLockfile: '11.3.0', allowBuilds: '10.26.0', dangerouslyAllowAllBuilds: '10.9.0', strictDepBuilds: '10.3.0', ignoredBuiltDependencies: '10.1.0' }

export function supportedVersion(version: string | null) {
  return !!version && major(version) >= 10 && major(version) <= 12 && prerelease(version) === null
}

export function settingState(key: InstallPolicyKey, version: string | null) {
  if (!supportedVersion(version)) {
    return 'unknown' as const
  }
  if (gte(version!, '11.0.0') && legacyBuildKeys.includes(key)) {
    return 'removed' as const
  }
  if (since[key] && lt(version!, since[key]!)) {
    return 'unsupported' as const
  }
  return 'active' as const
}

export function defaultSetting(key: InstallPolicyKey, version: string, releaseAgeConfigured: boolean): unknown {
  if (key === 'minimumReleaseAge') {
    return gte(version, '11.0.0') ? 1440 : 0
  }
  if (key === 'minimumReleaseAgeStrict') {
    return releaseAgeConfigured
  }
  if (key === 'strictDepBuilds') {
    return gte(version, '11.0.0')
  }
  if (key === 'minimumReleaseAgeIgnoreMissingTime') {
    return true
  }
  if (['trustLockfile', 'ignoreScripts', 'ignoreDepScripts', 'dangerouslyAllowAllBuilds'].includes(key)) {
    return false
  }
  if (key === 'trustPolicy') {
    return 'off'
  }
  if (key === 'minimumReleaseAgeExclude' || key === 'trustPolicyExclude') {
    return []
  }
  return null
}

/** Return public package identity, never a Git URL, credential or arbitrary selector text. */
export function selectorIdentity(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }
  const matched = /^(@[\w.~-]+\/[\w.~*+-]+|[\w.~*+-]+)(?:@(.+))?$/iu.exec(value)
  if (!matched) {
    return null
  }
  const suffix = matched[2]
  return { package: matched[1]!, selector: !suffix ? 'package' as const : validRange(suffix) ? 'version' as const : /^(?:git|https?:|ssh:|bitbucket:)/u.test(suffix) ? 'artifact' as const : null }
}

export function validPolicyValue(key: InstallPolicyKey, value: unknown) {
  if (key === 'minimumReleaseAge') {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
  }
  if (key === 'trustPolicy') {
    return value === 'off' || value === 'no-downgrade'
  }
  if (key === 'trustPolicyIgnoreAfter') {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
  }
  if (key === 'allowBuilds') {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && Object.entries(value).every(([name, decision]) => selectorIdentity(name)?.selector && (typeof decision === 'boolean' || decision === null))
  }
  if (key === 'onlyBuiltDependenciesFile') {
    return typeof value === 'string' && value.length > 0 && !value.includes('${')
  }
  if (['minimumReleaseAgeExclude', 'trustPolicyExclude', 'onlyBuiltDependencies', 'neverBuiltDependencies', 'ignoredBuiltDependencies'].includes(key)) {
    return Array.isArray(value) && value.every(item => selectorIdentity(item)?.selector)
  }
  return typeof value === 'boolean'
}

/** Minor releases introduced selector syntax separately from the setting itself. */
export function selectorSyntaxSupported(key: InstallPolicyKey, value: unknown, version: string) {
  if (!Array.isArray(value)) {
    return true
  }
  if (key === 'minimumReleaseAgeExclude' && lt(version, '10.17.0') && value.some(item => typeof item === 'string' && item.includes('*'))) {
    return false
  }
  return !(['minimumReleaseAgeExclude', 'onlyBuiltDependencies'].includes(key) && lt(version, '10.19.0') && value.some(item => selectorIdentity(item)?.selector === 'version'))
}
