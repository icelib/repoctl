import type { IcebreakerCommitlintOptions } from '@icebreakers/commitlint-config'
import type {
  UserDefinedOptions as IcebreakerEslintOptions,
  UserConfigItem as IcebreakerEslintUserConfigItem,
} from '@icebreakers/eslint-config'
import type { StylelintConfig as IcebreakerStylelintConfigOptions } from '@icebreakers/stylelint-config'
import type { Configuration as LintStagedConfiguration } from 'lint-staged'
import type { ViteUserConfig } from 'vitest/config'
import type { PublicApiConfig } from '../../commands/api-report/types'
import type { ProjectReferencesConfig } from '../project-references'

/**
 * `tooling.commitlint` 配置块。
 *
 * 该对象会与 `@icebreakers/commitlint-config` 的默认配置合并。
 */
export interface CommitlintToolingConfig extends IcebreakerCommitlintOptions {
  /**
   * 额外的 commitlint rules。
   * @default undefined
   */
}

/**
 * `tooling.eslint` 配置块。
 *
 * 该对象会与 `@icebreakers/eslint-config` 的默认 flat config 合并。
 */
export interface EslintToolingConfig extends IcebreakerEslintOptions {
  /**
   * 额外传给 `createEslint(...userConfigs)` 的后续配置项。
   * 在 `defineEslintConfig({ options, configs })` 中也可以放到顶层 `configs`。
   * @default []
   */
  configs?: IcebreakerEslintUserConfigItem[]
}

/**
 * `tooling.stylelint` 配置块。
 *
 * 该对象会与 `@icebreakers/stylelint-config` 的默认配置合并。
 */
export interface StylelintToolingConfig extends IcebreakerStylelintConfigOptions {
  /**
   * 额外的 stylelint rules。
   * @default undefined
   */
}

/**
 * `tooling.lintStaged` 配置块。
 */
export interface LintStagedToolingConfig {
  /**
   * 调用 repo CLI 的基础命令。
   * 通常保持为 `pnpm exec repo`，以便 Husky 与 lint-staged 入口统一。
   * @default 'pnpm exec repo'
   */
  repoCommand?: string
  /**
   * 直接透传完整的 lint-staged 原生配置。
   * 一旦提供，monorepo 默认规则将不再自动注入。
   * @default undefined
   */
  config?: LintStagedConfiguration
}

/**
 * `tooling.tsconfig` 配置块。
 *
 * 该对象会与 monorepo 内置的 TypeScript 基线配置合并。
 */
export interface TsconfigToolingConfig {
  /**
   * 顶层 `extends` 字段。
   * @default undefined
   */
  extends?: string | string[]
  /**
   * TypeScript `compilerOptions` 配置。
   * @default undefined
   */
  compilerOptions?: Record<string, unknown>
  /**
   * 顶层 `include` 字段。
   * @default undefined
   */
  include?: string[]
  /**
   * 顶层 `exclude` 字段。
   * @default undefined
   */
  exclude?: string[]
  /**
   * 顶层 `files` 字段。
   * @default undefined
   */
  files?: string[]
  /**
   * 顶层 `references` 字段。
   * @default undefined
   */
  references?: Array<{
    path: string
  }>
  /**
   * 顶层 `compileOnSave` 字段。
   * @default undefined
   */
  compileOnSave?: boolean
}

/**
 * `tooling.vitest` 配置块。
 *
 * 这些字段会参与根级 Vitest 配置的自动推导。
 */
export interface VitestToolingConfig {
  /**
   * 项目扫描与 workspace 文件解析的根目录。
   * @default process.cwd()
   */
  rootDir?: string
  /**
   * 显式指定需要扫描的项目根目录。
   * 未提供时优先从 `pnpm-workspace.yaml` 推导，失败后回退到 `['packages', 'apps']`。
   * @default undefined
   */
  projectRoots?: string[]
  /**
   * 子项目 Vitest 配置文件候选名列表。
   * @default ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js', 'vitest.config.cjs', 'vitest.workspace.ts', 'vitest.workspace.mts']
   */
  configCandidates?: string[]
  /**
   * workspace 配置文件名。
   * @default 'pnpm-workspace.yaml'
   */
  workspaceFile?: string
  /**
   * 是否把根级 `vitest.config.*` 也加入 `test.projects`。
   * @default false
   */
  includeWorkspaceRootConfig?: boolean
  /**
   * coverage 需要额外排除的 glob。
   * @default undefined
   */
  coverageExclude?: string[]
  /**
   * 是否开启 coverage。
   * @default true
   */
  coverageEnabled?: boolean
  /**
   * 是否对未被测试覆盖的文件也统计 coverage。
   * @default false
   */
  coverageAll?: boolean
  /**
   * 是否跳过 100% 覆盖文件的输出。
   * @default true
   */
  coverageSkipFull?: boolean
  /**
   * 直接透传到最终 `vitest.config.*` 返回值的完整配置覆盖项。
   * 适合配置 `test.coverage`、`resolve.alias`、`plugins` 等原生 Vitest/Vite 字段。
   * @default undefined
   */
  overrides?: ViteUserConfig
}

/**
 * `tooling.vitestProject` 配置块。
 *
 * 用于单个 package/app 的项目级 Vitest 默认值。
 */
export interface VitestProjectToolingConfig {
  /**
   * 测试环境内的 alias 映射。
   * @default undefined
   */
  alias?: Array<{
    find: string | RegExp
    replacement: string
  }>
  /**
   * 是否启用 Vitest globals。
   * @default true
   */
  globals?: boolean
  /**
   * 单测默认超时时间，单位毫秒。
   * @default 60000
   */
  testTimeout?: number
  /**
   * 测试环境类型。
   * @default 'node'
   */
  environment?: string
}

/**
 * `tooling.husky` 配置块。
 */
export interface HuskyToolingConfig {
  /**
   * pre-commit 钩子执行命令。
   * 未设置时默认运行 `pnpm exec lint-staged`。
   * @default undefined
   */
  preCommitCommand?: string
  /**
   * commit-msg 钩子执行命令。
   * 可通过 `{editFile}` 占位符注入 commit message 文件路径。
   * 未设置时默认运行 `pnpm exec commitlint --edit {editFile}`。
   * @default undefined
   */
  commitMsgCommand?: string
}

/**
 * `repoctl.config.ts` 中 `tooling` 总配置。
 *
 * 每个字段分别映射到对应的配置工厂与验证命令。
 */
export interface ToolingConfig {
  /** Explicit public declaration entrypoints and reviewed API baselines. */
  apiReports?: PublicApiConfig
  commitlint?: CommitlintToolingConfig
  eslint?: EslintToolingConfig
  stylelint?: StylelintToolingConfig
  lintStaged?: LintStagedToolingConfig
  tsconfig?: TsconfigToolingConfig
  projectReferences?: ProjectReferencesConfig
  vitest?: VitestToolingConfig
  vitestProject?: VitestProjectToolingConfig
  husky?: HuskyToolingConfig
}
