import type {
  IcebreakerCommitlintConfig,
} from '@icebreakers/commitlint-config'
import type {
  IcebreakerEslintConfig,
  UserConfigItem as IcebreakerEslintUserConfigItem,
} from '@icebreakers/eslint-config'
import type {
  IcebreakerStylelintConfig,
} from '@icebreakers/stylelint-config'
import type { ViteUserConfig } from 'vitest/config'
import type {
  EslintToolingConfig,
  LintStagedToolingConfig,
  VitestProjectToolingConfig,
  VitestToolingConfig,
} from '../types'

/**
 * `commitlint.config.*` 最终导出的配置类型。
 *
 */
export type MonorepoCommitlintConfig = IcebreakerCommitlintConfig

/**
 * `eslint.config.js` 最终导出的 flat config 类型。
 */
export type MonorepoEslintConfig = IcebreakerEslintConfig

/**
 * `stylelint.config.js` 最终导出的配置类型。
 *
 */
export type MonorepoStylelintConfig = IcebreakerStylelintConfig

/**
 * `lint-staged` 最终配置对象。
 *
 * key 为 glob pattern，value 为命令数组或命令生成函数。
 */
export interface MonorepoLintStagedConfig {
  [pattern: string]: string[] | ((files: string[]) => string | string[])
}

/**
 * `tsconfig.json` 最终导出的配置对象。
 */
export interface MonorepoTsconfig {
  extends?: string | string[]
  compilerOptions?: Record<string, unknown>
  include?: string[]
  exclude?: string[]
  files?: string[]
  references?: Array<{
    path: string
  }>
  compileOnSave?: boolean
}

export interface DefineConfigOptions<TConfig> {
  cwd?: string
  options?: TConfig
}

export interface DefineEslintConfigOptions extends DefineConfigOptions<EslintToolingConfig> {
  /**
   * 额外传给 ESLint flat config 工厂的配置片段。
   *
   * 这等价于 `options.configs`，但更贴近 flat config 的“基础 options + 后续 configs”写法。
   */
  configs?: IcebreakerEslintUserConfigItem[]
}

/**
 * `createMonorepoLintStagedConfig()` 与 `defineLintStagedConfig()` 的配置项。
 */
export interface MonorepoLintStagedConfigOptions extends LintStagedToolingConfig {}

/**
 * `createMonorepoVitestConfig()` 与 `defineVitestConfig()` 的共享配置项。
 *
 * 这些值会先参与 monorepo 级默认配置计算，再产出最终的 Vitest `test` 配置。
 */
export interface MonorepoVitestConfigOptions extends VitestToolingConfig {}

/**
 * `createMonorepoVitestProjectConfig()` 的项目级配置项。
 */
export interface MonorepoVitestProjectConfigOptions extends VitestProjectToolingConfig {}

/**
 * `createMonorepoVitestConfig()` 返回的标准结果结构。
 *
 * 该类型可用于约束自定义封装或二次 merge 的返回值。
 */
export interface MonorepoVitestConfigResult extends Omit<ViteUserConfig, 'test'> {
  test: NonNullable<ViteUserConfig['test']> & {
    projects?: NonNullable<ViteUserConfig['test']>['projects']
    coverage?: NonNullable<NonNullable<ViteUserConfig['test']>['coverage']> & {
      enabled?: boolean
      all?: boolean
      skipFull?: boolean
      exclude?: string[]
    }
    forceRerunTriggers?: string[]
  }
}

/**
 * 单个 package/app 的 `vitest.config.*` 最终导出结构。
 */
export interface MonorepoVitestProjectConfigResult {
  test: {
    alias?: Array<{
      find: string | RegExp
      replacement: string
    }>
    globals: boolean
    testTimeout: number
    environment?: string
  }
}

/**
 * `defineVitestConfig()` 的最终覆盖项。
 */
export type MonorepoVitestConfigOverrides = ViteUserConfig

export interface DefineVitestConfigOptions {
  cwd?: string
  options?: MonorepoVitestConfigOptions
  overrides?: MonorepoVitestConfigOverrides
}

export interface DefineVitestProjectConfigOptions {
  cwd?: string
  options?: MonorepoVitestProjectConfigOptions
}
