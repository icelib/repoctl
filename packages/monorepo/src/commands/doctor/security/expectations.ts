import type { evaluateSecurity } from './evaluate'
import type { InstallSecurityExpectations } from './types'
import { gte } from 'semver'
import { record } from '../../deps/files'
import { selectorIdentity } from './settings'

export function validateExpectations(input: unknown): InstallSecurityExpectations {
  const config = record(input)
  if (!config || Object.keys(config).some(key => !['minimumReleaseAge', 'trustPolicy', 'requireBuildApproval', 'severity', 'exceptions'].includes(key))
    || (config['minimumReleaseAge'] !== undefined && (typeof config['minimumReleaseAge'] !== 'number' || !Number.isFinite(config['minimumReleaseAge']) || config['minimumReleaseAge'] < 0))
    || (config['trustPolicy'] !== undefined && config['trustPolicy'] !== 'no-downgrade')
    || (config['requireBuildApproval'] !== undefined && typeof config['requireBuildApproval'] !== 'boolean')
    || (config['severity'] !== undefined && !['warn', 'fail'].includes(config['severity'] as string))
    || (config['exceptions'] !== undefined && !Array.isArray(config['exceptions']))) {
    throw new Error('Invalid installation security expectations.')
  }
  const seen = new Set<string>()
  for (const item of config['exceptions'] as unknown[] ?? []) {
    const exception = record(item)
    if (!exception || Object.keys(exception).some(key => !['key', 'package', 'reason'].includes(key))
      || !['minimumReleaseAgeExclude', 'trustPolicyExclude'].includes(exception['key'] as string)
      || !selectorIdentity(exception['package'])?.selector || typeof exception['reason'] !== 'string' || !exception['reason'].trim()) {
      throw new Error('Installation security exceptions require a supported policy key, package selector and reason.')
    }
    const id = JSON.stringify([exception['key'], exception['package']])
    if (seen.has(id)) {
      throw new Error('Duplicate installation security exception.')
    }
    seen.add(id)
  }
  return config as InstallSecurityExpectations
}

export function evaluateExpectations(result: ReturnType<typeof evaluateSecurity>, config: InstallSecurityExpectations) {
  const status = config.severity ?? 'warn'
  if (config.minimumReleaseAge !== undefined) {
    const age = result.values.get('minimumReleaseAge')
    if (typeof age !== 'number' || age < config.minimumReleaseAge || (config.minimumReleaseAge > 0 && (result.values.get('minimumReleaseAgeStrict') === false || result.values.get('minimumReleaseAgeIgnoreMissingTime') === true))) {
      result.add('install-security-expectation', status, `Expected at least ${config.minimumReleaseAge} minutes of release age without non-strict fallback.`)
    }
  }
  if (config.trustPolicy && (result.values.get('trustPolicy') !== config.trustPolicy || result.values.get('trustLockfile') === true || (result.version && gte(result.version, '11.23.0') && result.values.get('minimumReleaseAgeIgnoreMissingTime') === true) || result.values.get('trustPolicyIgnoreAfter') != null)) {
    result.add('install-security-expectation', status, 'Expected trustPolicy=no-downgrade without trusted-lockfile, missing-time or age-cutoff bypasses.')
  }
  if (config.requireBuildApproval && ['unknown', 'allowed'].includes(result.builds.default)) {
    result.add('install-security-expectation', status, 'Expected explicit approval before dependency scripts can run.')
  }
  for (const key of ['minimumReleaseAgeExclude', 'trustPolicyExclude'] as const) {
    const selectors = result.values.get(key)
    for (const selector of Array.isArray(selectors) ? selectors : []) {
      const exception = config.exceptions?.find(item => item.key === key && item.package === selector)
      result.add('install-security-exception', exception ? 'pass' : status, `${key}: ${selectorIdentity(selector)!.package}; ${exception ? exception.reason : 'no organization exception reason is recorded'}.`)
    }
  }
  for (const exception of config.exceptions ?? []) {
    const selectors = result.values.get(exception.key)
    if (!Array.isArray(selectors) || !selectors.includes(exception.package)) {
      result.add('install-security-exception', 'warn', `Unused reason for ${exception.key}: ${selectorIdentity(exception.package)!.package}.`)
    }
  }
}
