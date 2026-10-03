import type { MonorepoConfig } from '../types'
import type { ConfigSourceLayer, ConfigValueSource, OrganizationPresetResolution } from '../types/presets'
import fs from 'node:fs'
import { realpath } from 'node:fs/promises'
import { loadConfig } from 'c12'
import path from 'pathe'
import { commandConfigDirectory } from './config/context'
import { validatedConfigLoading } from './config/loading'
import { mergeConfigValues } from './config/merge'
import { assertMonorepoConfig, ConfigValidationError } from './config/validation'
import { resolveOrganizationPresets } from './presets/load'

export interface LoadedMonorepoConfig {
  file: string | null
  /** Canonical absolute dependency paths with normalized separators for comparisons. */
  files: string[]
  config: MonorepoConfig
  /** Original C12 layers before default merging removes null values; not CLI output. */
  rawLayers: MonorepoConfig[]
  sourceLayers: ConfigSourceLayer[]
  sources: Record<string, ConfigValueSource>
  presets: OrganizationPresetResolution
}

/**
 * 简单的内存缓存，避免同一次命令中重复走磁盘加载配置。
 */
const cache = new Map<string, Promise<LoadedMonorepoConfig>>()
export const configExtensions = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'] as const

export function getRepoctlConfigCandidates(cwd: string) {
  return configExtensions.map(ext => path.resolve(cwd, `repoctl.config.${ext}`))
}

function findConfigFiles(cwd: string) {
  return getRepoctlConfigCandidates(cwd).filter(file => fs.existsSync(file))
}

/**
 * 基于 c12 的通用配置加载逻辑，支持多种配置文件格式。
 */
async function loadConfigInternal(cwd: string, refresh = false): Promise<LoadedMonorepoConfig> {
  const dependencies = new Set<string>()
  const { config, configFile, layers } = await loadConfig<MonorepoConfig>({
    name: 'repoctl',
    cwd,
    rcFile: false,
    defaults: {},
    globalRc: false,
    packageJson: false,
    ...validatedConfigLoading(dependencies, refresh),
  }).catch((error: unknown) => {
    if (error instanceof ConfigValidationError) {
      throw error
    }
    // Config modules can throw credentials or arbitrary values. Never serialize their message/cause.
    throw new ConfigValidationError([{ id: 'config.load-failed', path: '', actualType: 'unknown', expected: 'loadable repoctl configuration', suggestion: 'Check configuration syntax, imports and evaluation in your local editor.' }])
  })
  for (const layer of layers ?? []) {
    assertMonorepoConfig(layer.config ?? {})
  }
  assertMonorepoConfig(config ?? {})

  const matchedConfigFile = configFile && fs.existsSync(configFile)
    ? findConfigFiles(cwd).find(file => path.basename(file).toLowerCase() === path.basename(configFile).toLowerCase())
    : undefined
  const files = await Promise.all([...new Set([configFile, ...(layers ?? []).map(layer => layer.configFile), ...dependencies])]
    .filter((file): file is string => Boolean(file && fs.existsSync(file)))
    .map(async file => path.normalize(await realpath(file))))

  const file = matchedConfigFile
    ? await realpath(matchedConfigFile)
    : (configFile && fs.existsSync(configFile) ? await realpath(configFile) : null)
  const presets = await resolveOrganizationPresets(cwd, config?.presets ?? [])
  const failures = presets.diagnostics.filter(item => item.status === 'fail')
  if (failures.length) {
    throw new ConfigValidationError(failures.map(item => ({ id: 'config.invalid-value', path: item.path, actualType: 'preset', expected: 'valid installed organization preset', suggestion: `${item.id}: ${item.detail}` })))
  }
  const sourceLayers: ConfigSourceLayer[] = [
    ...presets.layers.map(layer => ({ source: { kind: 'preset' as const, file: layer.source.manifestFile, packageName: layer.source.packageName, version: layer.source.version }, config: layer.manifest.config ?? {} })),
    { source: { kind: 'project', file }, config: config ?? {} },
  ]
  const merged = mergeConfigValues(sourceLayers.map(layer => ({ source: layer.source, values: layer.config })))
  assertMonorepoConfig(merged.values)
  return {
    file,
    files: [...new Set([...files, ...presets.inputs.map(input => input.path)])],
    config: merged.values as MonorepoConfig,
    rawLayers: (layers ?? []).map(layer => layer.config ?? {}),
    sourceLayers,
    sources: merged.sources,
    presets,
  }
}

/**
 * 为 `repoctl.config.ts` 提供类型提示的辅助函数。
 *
 * 推荐在用户项目中这样写：
 *
 * @example
 * ```ts
 * import { defineMonorepoConfig } from 'repoctl'
 *
 * export default defineMonorepoConfig({
 *   tooling: {
 *     vitest: {
 *       includeWorkspaceRootConfig: false,
 *     },
 *   },
 * })
 * ```
 */
export function defineMonorepoConfig(config: MonorepoConfig) {
  return config
}

/**
 * 加载配置对象和实际命中的配置文件路径，供诊断和脚本集成使用。
 *
 * @param cwd 配置文件解析起点
 * @returns 配置文件路径和解析后的配置对象；未找到时 file 为 null、config 为空对象
 */
export async function loadMonorepoConfigDetails(cwd: string, options: { refresh?: boolean } = {}): Promise<LoadedMonorepoConfig> {
  const key = path.resolve(cwd)
  if (options.refresh) {
    cache.delete(key)
  }
  if (!cache.has(key)) {
    cache.set(key, loadConfigInternal(key, options.refresh))
  }
  return cache.get(key)!
}

/**
 * 加载指定目录的 `repoctl.config.*`，并在当前进程内做内存缓存。
 *
 * @param cwd 配置文件解析起点
 * @returns 解析后的配置对象；未找到时返回空对象
 */
export async function loadMonorepoConfig(cwd: string) {
  const { config } = await loadMonorepoConfigDetails(cwd)
  return config
}

/**
 * 获取单个命令对应的配置块。
 *
 * @param name 命令名称，对应 `repoctl.config.ts -> commands.<name>`
 * @param cwd 配置文件解析起点
 * @returns 对应命令配置；未配置时返回空对象
 */
export async function resolveCommandConfig<Name extends keyof NonNullable<MonorepoConfig['commands']>>(
  name: Name,
  cwd: string,
): Promise<NonNullable<MonorepoConfig['commands']>[Name]> {
  const config = await loadMonorepoConfig(await commandConfigDirectory(name, cwd))
  const commands = config.commands ?? {}
  const commandConfig = commands[name]
  return (commandConfig ?? {}) as NonNullable<MonorepoConfig['commands']>[Name]
}

/**
 * 获取 `repoctl.config.ts` 中完整的 `tooling` 配置块。
 *
 * @param cwd 配置文件解析起点
 * @returns `tooling` 配置；未配置时返回空对象
 */
export async function resolveToolingConfig(cwd: string): Promise<NonNullable<MonorepoConfig['tooling']>> {
  const config = await loadMonorepoConfig(cwd)
  return (config.tooling ?? {}) as NonNullable<MonorepoConfig['tooling']>
}

export type {
  AiCommandConfig,
  CleanCommandConfig,
  CliOpts,
  CommitlintToolingConfig,
  CreateChoiceOption,
  CreateCommandConfig,
  EslintToolingConfig,
  HuskyToolingConfig,
  InitCommandConfig,
  LintStagedToolingConfig,
  MirrorCommandConfig,
  MonorepoConfig,
  ReleaseAfterPublishHookConfig,
  ReleaseCommandConfig,
  StylelintToolingConfig,
  ToolingConfig,
  UpgradeCommandConfig,
  VitestProjectToolingConfig,
  VitestToolingConfig,
} from '../types'
