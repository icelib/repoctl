import type { IcebreakerCommitlintOptions } from '@icebreakers/commitlint-config'
import type { UserDefinedOptions as IcebreakerEslintOptions, UserConfigItem as IcebreakerEslintUserConfigItem } from '@icebreakers/eslint-config'
import type { StylelintConfig as IcebreakerStylelintOptions } from '@icebreakers/stylelint-config'
import type { CommitlintToolingConfig, EslintToolingConfig, StylelintToolingConfig } from '../types'
import type { DefineConfigOptions, DefineEslintConfigOptions, MonorepoCommitlintConfig, MonorepoEslintConfig, MonorepoStylelintConfig } from './types'
import { icebreaker as createCommitlint } from '@icebreakers/commitlint-config'
import { icebreaker as createEslint } from '@icebreakers/eslint-config'
import { icebreaker as createStylelint } from '@icebreakers/stylelint-config'
import { isDefineConfigWrapper, loadToolingSection, resolveConfigInput } from './shared'

function resolveEslintOptions(
  options: EslintToolingConfig = {},
  configs: IcebreakerEslintUserConfigItem[] = [],
): EslintToolingConfig {
  const {
    configs: inlineConfigs = [],
    ...rest
  } = options

  return {
    ...rest,
    configs: [
      ...(inlineConfigs as IcebreakerEslintUserConfigItem[]),
      ...configs,
    ],
  }
}

/**
 * 基于 `@icebreakers/commitlint-config` 创建 commitlint 配置。
 *
 * 适合在需要手动传入覆盖项时使用；如果只想读取 `repoctl.config.ts` 默认值，
 * 优先使用 `defineCommitlintConfig()`。
 *
 * @param options 额外合并到默认 commitlint 配置上的字段
 * @returns 可直接作为 `commitlint.config.ts` 默认导出的配置对象
 *
 * @example
 * ```ts
 * import { createMonorepoCommitlintConfig } from 'repoctl/tooling'
 *
 * export default createMonorepoCommitlintConfig({
 *   rules: {
 *     'subject-case': [0],
 *   },
 * })
 * ```
 */
export function createMonorepoCommitlintConfig(
  options: CommitlintToolingConfig = {},
): MonorepoCommitlintConfig {
  return createCommitlint(options as IcebreakerCommitlintOptions)
}

/**
 * 从 `repoctl.config.ts` 读取 `tooling.commitlint`，并生成 commitlint 配置。
 *
 * @param input `cwd` 用于指定配置文件解析起点，`options` 用于追加运行时覆盖项
 * @returns 可直接导出的 commitlint 配置对象
 *
 * @example
 * ```ts
 * import { defineCommitlintConfig } from 'repoctl/tooling'
 *
 * export default await defineCommitlintConfig()
 * ```
 */
export async function defineCommitlintConfig(
  input: DefineConfigOptions<CommitlintToolingConfig> = {},
): Promise<MonorepoCommitlintConfig> {
  const resolved = resolveConfigInput(input)
  const toolingOptions = await loadToolingSection('commitlint', resolved.cwd)
  return createMonorepoCommitlintConfig({
    ...toolingOptions,
    ...resolved.options,
  })
}

/**
 * 基于 `@icebreakers/eslint-config` 创建 ESLint 配置。
 *
 * 默认会追加一个用于忽略 `fixtures` 目录的 glob，除非显式传入其他 `ignores`。
 *
 * @param options 额外 ESLint 配置；`ignores` 默认会忽略 `fixtures` 目录
 * @param extraConfigs 额外追加的 flat config 片段，等价于 `options.configs`
 * @returns 可直接作为 `eslint.config.js` 默认导出的 flat config
 *
 * @example
 * ```js
 * import { createMonorepoEslintConfig } from 'repoctl/tooling'
 *
 * export default createMonorepoEslintConfig(
 *   { ignores: ['dist/**'] },
 *   { rules: { 'no-console': 'off' } },
 * )
 * ```
 */
export function createMonorepoEslintConfig(
  options: EslintToolingConfig = {},
  ...extraConfigs: IcebreakerEslintUserConfigItem[]
): MonorepoEslintConfig {
  const {
    configs: resolvedConfigs = [],
    ...rest
  } = resolveEslintOptions(options, extraConfigs)
  return createEslint(
    rest as IcebreakerEslintOptions,
    ...(resolvedConfigs as IcebreakerEslintUserConfigItem[]),
  )
}

/**
 * 从 `repoctl.config.ts` 读取 `tooling.eslint`，并生成 ESLint 配置。
 *
 * @param input `cwd` 用于指定配置文件解析起点，`options` 与 `configs` 用于追加运行时覆盖项
 * @returns 可直接导出的 ESLint flat config
 *
 * @example
 * ```js
 * import { defineEslintConfig } from 'repoctl/tooling'
 *
 * export default await defineEslintConfig(
 *   { ignores: ['dist/**'] },
 *   { rules: { 'no-console': 'off' } },
 * )
 * ```
 */
export async function defineEslintConfig(
  input: DefineEslintConfigOptions | EslintToolingConfig = {},
  ...configs: IcebreakerEslintUserConfigItem[]
): Promise<MonorepoEslintConfig> {
  const wrapped = isDefineConfigWrapper(input)
    ? input as DefineEslintConfigOptions
    : { options: input as EslintToolingConfig }
  const resolved = resolveConfigInput(wrapped)
  const toolingOptions = await loadToolingSection('eslint', resolved.cwd)
  return createMonorepoEslintConfig({
    ...toolingOptions,
    ...resolved.options,
  }, ...(wrapped.configs ?? []), ...configs)
}

/**
 * 基于 `@icebreakers/stylelint-config` 创建 Stylelint 配置。
 *
 * @param options 额外合并到默认 stylelint 配置上的字段
 * @returns 可直接作为 `stylelint.config.js` 默认导出的配置对象
 */
export function createMonorepoStylelintConfig(
  options: StylelintToolingConfig = {},
): MonorepoStylelintConfig {
  return createStylelint(options as IcebreakerStylelintOptions)
}

/**
 * 从 `repoctl.config.ts` 读取 `tooling.stylelint`，并生成 Stylelint 配置。
 *
 * @param input `cwd` 用于指定配置文件解析起点，`options` 用于追加运行时覆盖项
 * @returns 可直接导出的 Stylelint 配置对象
 */
export async function defineStylelintConfig(
  input: DefineConfigOptions<StylelintToolingConfig> = {},
): Promise<MonorepoStylelintConfig> {
  const resolved = resolveConfigInput(input)
  const toolingOptions = await loadToolingSection('stylelint', resolved.cwd)
  return createMonorepoStylelintConfig({
    ...toolingOptions,
    ...resolved.options,
  })
}
