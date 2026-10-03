import type { InstallPolicyKey, InstallSecurityOptions, InstallSecurityPresetPlan } from './types'
import { isDeepStrictEqual } from 'node:util'
import YAML from 'yaml'
import { hash, readInput, record } from '../../deps/files'
import { writeDependencyTransaction } from '../../deps/transaction'
import { settingState, supportedVersion } from './settings'
import { readSecuritySources } from './sources'

const presetValues = { minimumReleaseAge: 1440, minimumReleaseAgeStrict: true, minimumReleaseAgeIgnoreMissingTime: false, trustPolicy: 'no-downgrade', allowBuilds: {}, dangerouslyAllowAllBuilds: false, strictDepBuilds: true } as const

function renderAdditions(content: string, additions: InstallSecurityPresetPlan['additions']) {
  const document = YAML.parseDocument(content)
  if (document.errors.length || !record(document.toJS())) {
    throw new Error('Cannot plan changes to invalid pnpm-workspace.yaml.')
  }
  for (const [key, value] of Object.entries(additions)) {
    if (document.has(key)) {
      throw new Error(`Preset refuses to overwrite an existing ${key}.`)
    }
    document.set(key, structuredClone(value))
  }
  if (!Object.keys(additions).length) {
    return content
  }
  if (content.split(/\r?\n/u).some(line => line.trim() === '...' || line.trim().startsWith('... #'))) {
    throw new Error('Explicit YAML document end markers require manual review before adding preset keys.')
  }
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const appended = YAML.stringify(additions).replaceAll('\n', newline)
  return `${content}${content.endsWith('\n') ? '' : newline}${appended}`
}

/** Add only absent defaults. Every existing project, global or inherited environment value is retained. */
export async function planInstallSecurityPreset(cwd: string, options: InstallSecurityOptions = {}): Promise<InstallSecurityPresetPlan> {
  const sources = await readSecuritySources(cwd, options)
  if (!supportedVersion(sources.version) || sources.uncertain.size) {
    throw new Error('An unambiguous, supported pnpm version and configuration are required before planning a security preset.')
  }
  const original = await readInput(sources.workspaceDir, 'pnpm-workspace.yaml')
  const additions: InstallSecurityPresetPlan['additions'] = {}
  const preserved: InstallPolicyKey[] = []
  for (const [key, value] of Object.entries(presetValues) as Array<[keyof typeof presetValues, typeof presetValues[keyof typeof presetValues]]>) {
    if (settingState(key, sources.version) !== 'active') {
      continue
    }
    if (sources.values.has(key)) {
      preserved.push(key)
    }
    else if (key !== 'allowBuilds' || (sources.values.get('dangerouslyAllowAllBuilds')?.value !== true && !['onlyBuiltDependencies', 'onlyBuiltDependenciesFile', 'neverBuiltDependencies', 'ignoredBuiltDependencies'].some(key => sources.values.has(key as InstallPolicyKey)))) {
      additions[key] = structuredClone(value)
    }
  }
  const content = renderAdditions(original, additions)
  return { schemaVersion: 1, kind: 'install-security-preset', preset: 'balanced', workspaceDir: sources.workspaceDir, pnpmVersion: sources.version!, policyHash: hash(JSON.stringify([...sources.values])), beforeHash: hash(original), afterHash: hash(content), additions, preserved, diff: Object.entries(additions).map(([key, value]) => `+ ${key}: ${JSON.stringify(value)}`).join('\n') }
}

export async function applyInstallSecurityPreset(cwd: string, plan: InstallSecurityPresetPlan) {
  if (!plan || plan.schemaVersion !== 1 || plan.kind !== 'install-security-preset' || plan.preset !== 'balanced'
    || typeof plan.workspaceDir !== 'string' || typeof plan.pnpmVersion !== 'string'
    || !/^[a-f\d]{64}$/u.test(plan.policyHash) || !/^[a-f\d]{64}$/u.test(plan.beforeHash) || !/^[a-f\d]{64}$/u.test(plan.afterHash) || !record(plan.additions)
    || Object.entries(plan.additions).some(([key, value]) => !Object.hasOwn(presetValues, key) || !isDeepStrictEqual(value, presetValues[key as keyof typeof presetValues]))) {
    throw new Error('Invalid installation security preset plan.')
  }
  const current = await planInstallSecurityPreset(cwd)
  if (current.workspaceDir !== plan.workspaceDir || current.pnpmVersion !== plan.pnpmVersion) {
    throw new Error('Security preset belongs to a different workspace or pnpm version.')
  }
  const original = await readInput(current.workspaceDir, 'pnpm-workspace.yaml')
  if (hash(original) === plan.afterHash) {
    return { status: 'unchanged' as const, changed: [] as string[] }
  }
  if (!isDeepStrictEqual(current, plan)) {
    throw new Error('Security preset inputs changed; preview again before applying.')
  }
  const content = renderAdditions(original, plan.additions)
  if (hash(content) !== plan.afterHash) {
    throw new Error('Security preset output changed; preview again before applying.')
  }
  await writeDependencyTransaction(current.workspaceDir, [{ path: 'pnpm-workspace.yaml', original, content }])
  return { status: 'applied' as const, changed: ['pnpm-workspace.yaml'] }
}
