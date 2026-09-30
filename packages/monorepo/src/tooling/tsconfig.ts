import type { TsconfigToolingConfig } from '../types'
import type { DefineConfigOptions, MonorepoTsconfig } from './types'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse as parseJsonc } from 'comment-json'
import { loadToolingSection, resolveConfigInput } from './shared'

const monorepoTsconfigPath = fileURLToPath(import.meta.resolve('@icebreakers/monorepo/tsconfig'))

function mergeTsconfig(
  base: MonorepoTsconfig,
  override?: TsconfigToolingConfig | MonorepoTsconfig,
): MonorepoTsconfig {
  if (!override) {
    return base
  }

  return {
    ...base,
    ...override,
    ...(base.compilerOptions || override.compilerOptions
      ? {
          compilerOptions: {
            ...(base.compilerOptions ?? {}),
            ...(override.compilerOptions ?? {}),
          },
        }
      : {}),
  }
}

function loadBundledTsconfig(): MonorepoTsconfig {
  const configContent = fs.readFileSync(monorepoTsconfigPath, 'utf8')
  return parseJsonc(configContent) as MonorepoTsconfig
}

/**
 * 创建 monorepo 内置的 TypeScript 基线配置。
 *
 * @param options 额外覆盖项，会与包内置 `tsconfig.base.json` 合并
 * @returns 可直接写入或二次扩展的 `tsconfig.json` 配置对象
 */
export function createMonorepoTsconfig(
  options: TsconfigToolingConfig = {},
): MonorepoTsconfig {
  return mergeTsconfig(loadBundledTsconfig(), options)
}

/**
 * 从 `repoctl.config.ts` 读取 `tooling.tsconfig`，并生成最终的 TypeScript 配置对象。
 *
 * @param input `cwd` 用于指定配置文件解析起点，`options` 用于追加运行时覆盖项
 * @returns 可直接写入或导出的 `tsconfig.json` 配置对象
 */
export async function defineTsconfigConfig(
  input: DefineConfigOptions<TsconfigToolingConfig> = {},
): Promise<MonorepoTsconfig> {
  const resolved = resolveConfigInput(input)
  const toolingOptions = await loadToolingSection('tsconfig', resolved.cwd)
  return createMonorepoTsconfig(mergeTsconfig(toolingOptions ?? {}, resolved.options))
}
