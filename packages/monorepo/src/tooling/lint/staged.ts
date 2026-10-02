import type {
  DefineConfigOptions,
  MonorepoLintStagedConfig,
  MonorepoLintStagedConfigOptions,
} from '../types'
import { escapeForShell, loadToolingSection, resolveConfigInput } from '../shared'

/**
 * 创建适用于当前仓库约定的 `lint-staged` 配置。
 *
 * 默认行为：
 * - `*.{js,jsx,mjs,ts,tsx,mts,cts}` 运行 `eslint --fix`
 * - `*.vue` 同时运行 `eslint --fix` 与 `stylelint --fix --allow-empty-input`
 * - TypeScript/Vue files and workspace `package.json` files share one
 *   `pnpm exec repo verify staged-typecheck` task to avoid concurrent builds
 * - 样式文件运行 `stylelint --fix --allow-empty-input`
 *
 * @param options 可配置 `repoCommand`，默认值为 `pnpm exec repo`
 * @returns 可直接导出的 `lint-staged` 配置对象
 *
 * @example
 * ```js
 * import { createMonorepoLintStagedConfig } from 'repoctl/tooling'
 *
 * export default createMonorepoLintStagedConfig({
 *   repoCommand: 'pnpm exec repo',
 * })
 * ```
 */
export function createMonorepoLintStagedConfig(options: MonorepoLintStagedConfigOptions = {}): MonorepoLintStagedConfig {
  if (options.config) {
    return options.config as MonorepoLintStagedConfig
  }

  const repoCommand = options.repoCommand ?? 'pnpm exec repo'
  return {
    '*.{js,jsx,mjs,ts,tsx,mts,cts}': [
      'eslint --fix',
    ],
    '*.vue': [
      'eslint --fix',
      'stylelint --fix --allow-empty-input',
    ],
    '*.{ts,tsx,mts,cts,vue,json}': (files) => {
      const uniqueFiles = [...new Set(files)]
      if (uniqueFiles.length === 0) {
        return []
      }
      return `${repoCommand} verify staged-typecheck ${uniqueFiles.map(escapeForShell).join(' ')}`
    },
    '*.{json,md,mdx,html,yml,yaml}': [
      'eslint --fix',
    ],
    '*.{css,scss,sass,less}': [
      'stylelint --fix --allow-empty-input',
    ],
  }
}

/**
 * 从 `repoctl.config.ts` 读取 `tooling.lintStaged`，并生成 `lint-staged` 配置。
 *
 * @param input `cwd` 用于指定配置文件解析起点，`options` 用于追加运行时覆盖项
 * @returns 可直接导出的 `lint-staged` 配置对象
 */
export async function defineLintStagedConfig(
  input: DefineConfigOptions<MonorepoLintStagedConfigOptions> = {},
): Promise<MonorepoLintStagedConfig> {
  const resolved = resolveConfigInput(input)
  const toolingOptions = await loadToolingSection('lintStaged', resolved.cwd)
  return createMonorepoLintStagedConfig({
    ...toolingOptions,
    ...resolved.options,
  })
}
