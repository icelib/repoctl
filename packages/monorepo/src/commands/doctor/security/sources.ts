import type { InstallPolicyKey, InstallSecurityOptions } from './types'
import { readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import path from 'pathe'
import { gte, valid } from 'semver'
import YAML from 'yaml'
import { inspectPnpmRuntime } from '../../../utils/pnpm-runtime'
import { record } from '../../deps/files'
import { declaredPnpmVersion } from '../runtime/pnpm'
import { policyKeys } from './settings'

export interface PolicySourceValue { value: unknown, source: string }
interface Layer { source: string, values: Record<string, unknown>, active: boolean }

const keyName = (key: string) => key.replace(/[-_]/gu, '').toLowerCase()

async function textFile(filename: string, label: string) {
  try {
    return await readFile(filename, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw new Error(`Cannot read ${label} for installation policy inspection.`)
  }
}

async function yamlFile(filename: string, label: string) {
  const content = await textFile(filename, label)
  if (content === undefined) {
    return {}
  }
  try {
    const value = YAML.parse(content)
    if (value === null) {
      return {}
    }
    const object = record(value)
    if (!object) {
      throw new Error('Expected a map')
    }
    return object
  }
  catch {
    throw new Error(`Invalid ${label}; parser content is omitted to protect unrelated configuration values.`)
  }
}

/** Read only recognized non-auth keys; never return complete npmrc content. */
async function npmrcFile(filename: string, label: string) {
  const content = await textFile(filename, label)
  const output: Record<string, unknown> = {}
  for (const line of content?.split(/\r?\n/u) ?? []) {
    const separator = line.indexOf('=')
    if (separator < 1) {
      continue
    }
    const declared = line.slice(0, separator).trim()
    const array = declared.endsWith('[]')
    const name = array ? declared.slice(0, -2) : declared
    const key = policyKeys.find(key => keyName(key) === keyName(name))
    if (!key) {
      continue
    }
    let value: unknown
    try {
      value = YAML.parse(line.slice(separator + 1).trim())
    }
    catch {
      value = undefined
    }
    output[key] = array ? [...(Array.isArray(output[key]) ? output[key] : []), value] : value
  }
  return output
}

function environmentValues(prefix: 'pnpm_config_' | 'npm_config_') {
  const values: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.toLowerCase().startsWith(prefix)) {
      continue
    }
    const key = policyKeys.find(key => keyName(key) === keyName(name.slice(prefix.length)))
    if (key && value !== undefined) {
      try {
        values[key] = YAML.parse(value)
      }
      catch {
        values[key] = undefined
      }
    }
  }
  return values
}

function environmentPath(name: string) {
  return Object.entries(process.env).find(([key]) => key.toLowerCase() === name)?.[1]
}

function globalDirectory() {
  if (process.env['XDG_CONFIG_HOME']) {
    return path.join(process.env['XDG_CONFIG_HOME'], 'pnpm')
  }
  return process.platform === 'win32'
    ? process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'pnpm/config') : path.join(homedir(), '.config/pnpm')
    : process.platform === 'darwin' ? path.join(homedir(), 'Library/Preferences/pnpm') : path.join(homedir(), '.config/pnpm')
}

export async function readSecuritySources(cwd: string, options: InstallSecurityOptions = {}) {
  const found = await findWorkspaceDir(cwd)
  if (!found) {
    throw new Error('Installation policy inspection requires a pnpm workspace.')
  }
  const workspaceDir = path.normalize(await realpath(found))
  let manifest: Record<string, unknown>
  try {
    manifest = record(JSON.parse(await readFile(path.join(workspaceDir, 'package.json'), 'utf8'))) ?? {}
  }
  catch {
    throw new Error('Cannot read the root package manifest for installation policy inspection.')
  }
  if (options.pnpmVersion !== undefined && valid(options.pnpmVersion) !== options.pnpmVersion) {
    throw new Error('Installation policy auditing requires an exact pnpm version.')
  }
  const runtime = await inspectPnpmRuntime()
  const declared = declaredPnpmVersion(manifest['packageManager'])
  const version = options.pnpmVersion ?? (runtime.state === 'observed' ? runtime.version : declared) ?? null
  const evidence = options.pnpmVersion ? 'explicit' as const : runtime.state === 'observed' ? 'observed' as const : declared ? 'declared' as const : 'unknown' as const
  const modern = !!version && gte(version, '11.0.0')
  const global = globalDirectory()
  if (process.platform === 'win32' && global.includes('%')) {
    throw new Error('Unexpanded configuration directory variables require review before policy inspection.')
  }
  const workspace = await yamlFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'pnpm-workspace.yaml')
  const layers: Layer[] = [
    { source: 'global rc', values: await npmrcFile(path.join(global, 'rc'), 'global rc'), active: !modern },
    { source: 'user .npmrc', values: await npmrcFile(environmentPath('npm_config_userconfig') ?? path.join(homedir(), '.npmrc'), 'user .npmrc'), active: !modern },
    { source: 'global config.yaml', values: modern ? await yamlFile(path.join(global, 'config.yaml'), 'global config.yaml') : {}, active: modern },
    { source: 'package.json#pnpm', values: record(manifest['pnpm']) ?? {}, active: !modern },
    { source: 'project .npmrc', values: await npmrcFile(path.join(workspaceDir, '.npmrc'), 'project .npmrc'), active: !modern },
    { source: 'pnpm-workspace.yaml', values: workspace, active: true },
    { source: 'npm_config environment', values: environmentValues('npm_config_'), active: !modern },
    { source: 'pnpm_config environment', values: environmentValues('pnpm_config_'), active: modern },
  ]
  const values = new Map<InstallPolicyKey, PolicySourceValue>()
  const inactive: Array<{ key: InstallPolicyKey, source: string }> = []
  const uncertain = new Set<InstallPolicyKey>()
  for (const layer of layers) {
    for (const key of policyKeys) {
      if (!Object.hasOwn(layer.values, key)) {
        continue
      }
      if (!layer.active || (layer.source === 'global config.yaml' && (key === 'allowBuilds' || ['onlyBuiltDependencies', 'onlyBuiltDependenciesFile', 'neverBuiltDependencies', 'ignoredBuiltDependencies', 'ignoreDepScripts'].includes(key)))) {
        inactive.push({ key, source: layer.source })
        continue
      }
      if (!modern && values.has(key) && JSON.stringify(values.get(key)!.value) !== JSON.stringify(layer.values[key])) {
        uncertain.add(key)
      }
      if (key === 'allowBuilds' && layer.source.endsWith('environment')) {
        uncertain.add(key)
      }
      values.set(key, { value: layer.values[key], source: layer.source })
    }
  }
  const modules = await yamlFile(path.join(workspaceDir, 'node_modules/.modules.yaml'), 'installation metadata')
  const limitations = ['CLI arguments of other pnpm invocations are not observable; this report describes persisted settings and inherited environment.', 'No dependency lifecycle scripts or pnpmfile hooks are executed.']
  if (workspace['configDependencies'] || workspace['packageConfigs']) {
    limitations.push('Config dependencies or per-package policy can change effective settings; only the workspace-level declarations are inspected.')
    policyKeys.forEach(key => uncertain.add(key))
  }
  if ([...values.values()].some(({ value }) => typeof value === 'string' && value.includes('${'))) {
    limitations.push('Environment interpolation in policy values is not expanded; unresolved values are reported as invalid.')
  }
  return { workspaceDir, version, evidence, values, inactive, uncertain, modules, limitations }
}

export type InstallSecuritySources = Awaited<ReturnType<typeof readSecuritySources>>
