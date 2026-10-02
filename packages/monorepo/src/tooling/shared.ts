import type { ToolingConfig } from '../types'
import type { DefineConfigOptions } from './types'
import process from 'node:process'
import { loadMonorepoConfig } from '../core/config'

/**
 * 读取当前工作目录下的 `repoctl.config.*` 中的 `tooling` 配置块。
 *
 * @param cwd 配置文件解析起点。默认使用 `process.cwd()`
 * @returns 标准化后的 tooling 配置；未配置时返回空对象
 *
 * @example
 * ```ts
 * import { loadMonorepoToolingConfig } from 'repoctl/tooling'
 *
 * const tooling = await loadMonorepoToolingConfig()
 * console.log(tooling.vitest?.includeWorkspaceRootConfig)
 * ```
 */
export async function loadMonorepoToolingConfig(cwd = process.cwd()): Promise<NonNullable<ToolingConfig>> {
  const config = await loadMonorepoConfig(cwd)
  return config.tooling ?? {}
}

export async function loadToolingSection<K extends keyof NonNullable<ToolingConfig>>(key: K, cwd = process.cwd()) {
  const config = await loadMonorepoToolingConfig(cwd)
  return config[key]
}

export function resolveConfigInput<TConfig>(input?: DefineConfigOptions<TConfig>) {
  return {
    cwd: input?.cwd ?? process.cwd(),
    options: input?.options,
  }
}

export function isDefineConfigWrapper(input: unknown): input is DefineConfigOptions<unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return false
  }
  return 'cwd' in input || 'options' in input
}

export function escapeForShell(value: string) {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}
